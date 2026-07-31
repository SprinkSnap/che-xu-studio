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
    // Non-streaming JSON response (widget accepts { reply }).
    const result = (await env.AI.run(model, {
      messages,
      max_tokens: 512,
      temperature: 0.3,
      stream: false,
    })) as { response?: string } | string;

    let reply = '';
    if (typeof result === 'string') {
      reply = result;
    } else if (result && typeof result === 'object' && 'response' in result) {
      reply = String(result.response || '');
    }

    reply = sanitizeAssistantText(reply);
    if (!reply) {
      console.error('Chat AI empty response', { model });
      return jsonError('AI assistant is temporarily unavailable.', 503);
    }

    return jsonOk({ reply });
  } catch (err) {
    console.error(
      'Chat AI failure',
      { model },
      err instanceof Error ? err.message : 'unknown',
    );
    return jsonError('AI assistant is temporarily unavailable.', 503);
  }
};

