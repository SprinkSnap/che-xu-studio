import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { chatRequestSchema } from '../../lib/validation';
import {
  clientIp,
  isAllowedOrigin,
  jsonError,
  jsonOk,
  readJsonBody,
} from '../../lib/security';
import { enforceRateLimit } from '../../lib/rate-limit';
import { buildSystemPrompt, DEFAULT_AI_MODEL, sanitizeAssistantText } from '../../lib/chat';
import { getSiteUrl } from '../../config/site';
import { verifyTurnstile } from '../../lib/turnstile';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const siteUrl = getSiteUrl(env.PUBLIC_SITE_URL || import.meta.env.PUBLIC_SITE_URL);

  if (!isAllowedOrigin(request, siteUrl)) {
    return jsonError('Invalid origin', 403);
  }

  const ip = clientIp(request);
  const allowed = await enforceRateLimit(env.CHAT_RATE_LIMITER, `chat:${ip}`);
  if (!allowed) {
    return jsonError('Too many chat requests. Please try again shortly.', 429);
  }

  const body = await readJsonBody(request, 24_576);
  if (!body.ok) return body.response;

  const parsed = chatRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError('Invalid chat request', 400);
  }

  if (parsed.data.turnstileToken) {
    const ok = await verifyTurnstile(parsed.data.turnstileToken, env.TURNSTILE_SECRET_KEY || '', ip);
    if (!ok) return jsonError('Security check failed.', 400);
  }

  if (!env.AI) {
    return jsonError('AI assistant is temporarily unavailable.', 503);
  }

  const model = env.AI_MODEL || DEFAULT_AI_MODEL;
  const system = buildSystemPrompt();
  const messages = [
    { role: 'system', content: system },
    ...parsed.data.messages.map((m) => ({
      role: m.role,
      content: m.content.slice(0, 2000),
    })),
  ];

  try {
    const streamResult = (await env.AI.run(model, {
      messages,
      max_tokens: 512,
      temperature: 0.3,
      stream: true,
    })) as ReadableStream | { response?: string } | string;

    if (streamResult && typeof streamResult === 'object' && 'getReader' in streamResult) {
      const reader = (streamResult as ReadableStream).getReader();
      const decoder = new TextDecoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = typeof value === 'string' ? value : decoder.decode(value, { stream: true });
              const text = extractStreamText(chunk);
              if (text) controller.enqueue(new TextEncoder().encode(text));
            }
            controller.close();
          } catch {
            controller.error(new Error('stream failed'));
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    let reply = '';
    if (typeof streamResult === 'string') {
      reply = streamResult;
    } else if (streamResult && typeof streamResult === 'object' && 'response' in streamResult) {
      reply = String(streamResult.response || '');
    }

    reply = sanitizeAssistantText(reply);
    if (!reply) {
      return jsonError('AI assistant is temporarily unavailable.', 503);
    }

    return jsonOk({ reply });
  } catch (err) {
    console.error('Chat AI failure', err instanceof Error ? err.message : 'unknown');
    return jsonError('AI assistant is temporarily unavailable.', 503);
  }
};

function extractStreamText(chunk: string): string {
  const lines = chunk.split('\n');
  let out = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (payload === '[DONE]') continue;
    try {
      const json = JSON.parse(payload) as {
        response?: string;
        delta?: { content?: string };
      };
      if (json.response) out += json.response;
      else if (json.delta?.content) out += json.delta.content;
    } catch {
      out += payload;
    }
  }
  return sanitizeAssistantText(out) ? out.replace(/<[^>]*>/g, '') : '';
}
