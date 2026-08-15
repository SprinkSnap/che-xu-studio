import type { APIRoute } from 'astro';
import { getPublicCapabilityServiceClient } from '../../../lib/public-links/service';
import { handleStripeWebhookRequest } from '../../../lib/stripe/webhooks';
import { readStripeEnvFromRuntime, isStripeWebhookConfigured } from '../../../lib/stripe/config';

export const prerender = false;

/**
 * Stripe webhook endpoint.
 * - No Studio auth / CSRF (provider-signed)
 * - Raw body required for signature verification
 * - Idempotent via webhook_events unique (provider, provider_event_id)
 */
export const POST: APIRoute = async ({ request }) => {
  const stripeEnv = await readStripeEnvFromRuntime();
  if (!isStripeWebhookConfigured(stripeEnv)) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const service = await getPublicCapabilityServiceClient();
  if (!service) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return handleStripeWebhookRequest(service, request, stripeEnv);
};

export const ALL: APIRoute = async ({ request }) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new Response('Method Not Allowed', { status: 405 });
};
