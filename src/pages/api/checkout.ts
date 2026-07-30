import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { nanoid } from 'nanoid';
import { checkoutSchema } from '../../lib/validation';
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
import { createCheckoutSession, resolveCheckoutMode } from '../../lib/stripe';
import { getPackageById } from '../../config/packages';
import { getSiteUrl } from '../../config/site';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const siteUrl = getSiteUrl(env.PUBLIC_SITE_URL || import.meta.env.PUBLIC_SITE_URL);

  if (request.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  if (!isAllowedOrigin(request, siteUrl)) {
    return jsonError('Invalid origin', 403);
  }

  const ip = clientIp(request);
  const allowed = await enforceRateLimit(env.CHECKOUT_RATE_LIMITER, `checkout:${ip}`);
  if (!allowed) {
    return jsonError('Too many requests. Please try again shortly.', 429);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = checkoutSchema.safeParse(body.data);
  if (!parsed.success) {
    console.error('Checkout validation failed', redactForLogs(body.data));
    return jsonError('Invalid checkout request', 400);
  }

  const raw = body.data as Record<string, unknown>;
  for (const key of ['price', 'amount', 'stripePriceId', 'mode', 'successUrl', 'cancelUrl', 'quantity']) {
    if (key in raw && raw[key] !== undefined) {
      return jsonError('Invalid checkout request', 400);
    }
  }

  const turnstileOk = await verifyTurnstile(
    parsed.data.turnstileToken,
    env.TURNSTILE_SECRET_KEY || '',
    ip,
  );
  if (!turnstileOk) {
    return jsonError('Security check failed. Please try again.', 400);
  }

  const pkg = getPackageById(parsed.data.planId);
  if (!pkg) {
    return jsonError('Invalid plan', 400);
  }

  const mode = resolveCheckoutMode(pkg, env);
  if (mode === 'quote') {
    return jsonOk(
      {
        quoteRequired: true,
        error: 'This package needs an exact quote before payment.',
        planId: pkg.id,
      },
      422,
    );
  }

  const result = await createCheckoutSession({
    env: {
      ...env,
      PUBLIC_SITE_URL: siteUrl,
    },
    planId: pkg.id,
    customer: {
      name: parsed.data.name,
      email: parsed.data.email,
      company: parsed.data.company || undefined,
      existingWebsite: parsed.data.existingWebsite || undefined,
      projectGoal: parsed.data.projectGoal || undefined,
    },
    idempotencyKey: `checkout_${pkg.id}_${parsed.data.email}_${nanoid(10)}`,
  });

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  try {
    if (env.DB) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT OR IGNORE INTO orders (
          id, stripe_session_id, plan_id, customer_email, customer_name,
          status, mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          nanoid(),
          result.sessionId,
          pkg.id,
          parsed.data.email,
          parsed.data.name,
          'pending',
          result.mode,
          now,
          now,
        )
        .run();
    }
  } catch (err) {
    console.error('Pending order insert failed', err instanceof Error ? err.message : 'unknown');
  }

  return jsonOk({ url: result.url, sessionId: result.sessionId });
};
