import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { nanoid } from 'nanoid';
import { contactSchema } from '../../lib/validation';
import {
  clientIp,
  isAllowedOrigin,
  jsonError,
  jsonOk,
  readJsonBody,
  redactForLogs,
} from '../../lib/security';
import { verifyTurnstile } from '../../lib/turnstile';
import { enforceRateLimit } from '../../lib/rate-limit';
import { insertLead } from '../../lib/db';
import { getSiteUrl, siteConfig } from '../../config/site';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const siteUrl = getSiteUrl(env.PUBLIC_SITE_URL || import.meta.env.PUBLIC_SITE_URL);
  const studioEmail = siteConfig.contact.email;

  if (!isAllowedOrigin(request, siteUrl)) {
    return jsonError('Invalid origin', 403);
  }

  const ip = clientIp(request);
  const allowed = await enforceRateLimit(env.CONTACT_RATE_LIMITER, `contact:${ip}`);
  if (!allowed) {
    return jsonError('Too many requests. Please try again shortly.', 429);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = contactSchema.safeParse(body.data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return new Response(JSON.stringify({ error: 'Please correct the highlighted fields.', fieldErrors }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if (parsed.data.website) {
    return jsonOk({ ok: true });
  }

  const turnstileSecret = env.TURNSTILE_SECRET_KEY || '';
  if (!turnstileSecret) {
    return new Response(
      JSON.stringify({
        error: 'The contact form is not fully configured yet. Please email us directly.',
        code: 'TURNSTILE_UNAVAILABLE',
        email: studioEmail,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  const turnstileOk = await verifyTurnstile(parsed.data.turnstileToken, turnstileSecret, ip);
  if (!turnstileOk) {
    return jsonError('Security check failed. Please try again.', 400);
  }

  if (!env.DB) {
    console.error('Contact form: DB binding missing');
    return new Response(
      JSON.stringify({
        error:
          'We could not save your message in our system right now. Please email us and we will reply promptly.',
        code: 'STORAGE_UNAVAILABLE',
        email: studioEmail,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  try {
    await insertLead(env.DB, {
      id: nanoid(),
      name: parsed.data.name,
      email: parsed.data.email,
      serviceInterest: parsed.data.serviceInterest,
      message: parsed.data.message,
      phone: parsed.data.phone || undefined,
      marketingConsent: parsed.data.marketingConsent,
      currentWebsite: parsed.data.currentWebsite || undefined,
      businessType: parsed.data.businessType || undefined,
      primaryGoal: parsed.data.primaryGoal || undefined,
      pagesFeatures: parsed.data.pagesFeatures || undefined,
      budgetRange: parsed.data.budgetRange || undefined,
      targetTimeline: parsed.data.targetTimeline || undefined,
      preferredContact: parsed.data.preferredContact || undefined,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      'Lead insert failed',
      err instanceof Error ? err.message : 'unknown',
      redactForLogs({ serviceInterest: parsed.data.serviceInterest }),
    );
    return new Response(
      JSON.stringify({
        error: 'Unable to save your message right now. Please email us directly.',
        code: 'STORAGE_UNAVAILABLE',
        email: studioEmail,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }

  return jsonOk({ ok: true });
};
