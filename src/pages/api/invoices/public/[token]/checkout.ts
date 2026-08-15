import type { APIRoute } from 'astro';
import { getPublicCapabilityServiceClient } from '../../../../../lib/public-links/service';
import { resolveInvoicePublicLink } from '../../../../../lib/public-links/resolve';
import { isInvoicePayableRelaxed } from '../../../../../lib/payments/eligibility';
import { createInvoiceCheckoutSession, CheckoutError } from '../../../../../lib/stripe/checkout';
import { readStripeEnvFromRuntime, isStripeSecretConfigured } from '../../../../../lib/stripe/config';
import { enforceRateLimit } from '../../../../../lib/rate-limit';
import { clientIp } from '../../../../../lib/security';
import { isSameOriginMutation, requestSiteOrigin } from '../../../../../lib/auth/origin';
import { redactProposalTokenPath } from '../../../../../lib/public-links/tokens';

export const prerender = false;

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
};

function htmlError(message: string, status: number): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex,nofollow,noarchive"/><title>Payment unavailable</title></head><body><p>${message}</p></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...privateHeaders,
      },
    },
  );
}

export const POST: APIRoute = async ({ params, request, url }) => {
  const rawToken = (params.token ?? '').trim();
  const origin = requestSiteOrigin(request, url);
  if (!isSameOriginMutation(request, origin)) {
    return htmlError('Invalid request origin.', 403);
  }

  let checkoutLimiter: { limit: (o: { key: string }) => Promise<{ success: boolean }> } | undefined;
  try {
    const worker = await import('cloudflare:workers');
    checkoutLimiter = worker.env.CHECKOUT_RATE_LIMITER;
  } catch {
    checkoutLimiter = undefined;
  }

  const ip = clientIp(request);
  const allowed = await enforceRateLimit(checkoutLimiter, `checkout:${ip}`);
  if (!allowed) {
    return htmlError('Too many payment attempts. Please try again shortly.', 429);
  }

  const service = await getPublicCapabilityServiceClient();
  if (!service) {
    return htmlError('Payment is temporarily unavailable.', 503);
  }

  const stripeEnv = await readStripeEnvFromRuntime();
  if (!isStripeSecretConfigured(stripeEnv)) {
    return htmlError('Online payment is not configured yet.', 503);
  }

  const resolved = await resolveInvoicePublicLink(service, rawToken);
  if (!resolved.ok) {
    return htmlError('This invoice link is no longer available.', 404);
  }

  const invoice = resolved.document.invoice;
  const payable = isInvoicePayableRelaxed({
    id: invoice.id,
    client_id: invoice.client_id,
    project_id: invoice.project_id,
    invoice_number: invoice.invoice_number,
    invoice_type: invoice.invoice_type,
    status: invoice.status,
    currency: invoice.currency,
    total_minor: invoice.total_minor,
    amount_paid_minor: invoice.amount_paid_minor,
    balance_due_minor: invoice.balance_due_minor,
    updated_at: invoice.updated_at,
    voided_at: invoice.voided_at,
  });

  if (!payable) {
    return htmlError('This invoice cannot be paid.', 400);
  }

  try {
    const session = await createInvoiceCheckoutSession(service, {
      invoice: {
        id: invoice.id,
        client_id: invoice.client_id,
        project_id: invoice.project_id,
        invoice_number: invoice.invoice_number,
        invoice_type: invoice.invoice_type,
        status: invoice.status,
        currency: invoice.currency,
        total_minor: invoice.total_minor,
        amount_paid_minor: invoice.amount_paid_minor,
        balance_due_minor: invoice.balance_due_minor,
        updated_at: invoice.updated_at,
        voided_at: invoice.voided_at,
        client_contact_email: invoice.client_contact_email,
      },
      rawToken,
      siteOrigin: origin,
      customerEmail: invoice.client_contact_email,
      stripeEnv,
    });

    return new Response(null, {
      status: 303,
      headers: {
        Location: session.url,
        ...privateHeaders,
      },
    });
  } catch (error) {
    console.error('Checkout create failed', {
      path: redactProposalTokenPath(url.pathname),
      code: error instanceof CheckoutError ? error.code : 'unknown',
    });
    const message =
      error instanceof CheckoutError ? error.message : 'Unable to start checkout. Please try again.';
    return htmlError(message, 502);
  }
};

export const ALL: APIRoute = async ({ request }) => {
  if (request.method === 'POST') {
    // Handled above
  }
  return new Response('Method Not Allowed', {
    status: 405,
    headers: privateHeaders,
  });
};
