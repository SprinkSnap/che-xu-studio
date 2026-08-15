import type { APIRoute } from 'astro';
import { getPublicCapabilityServiceClient } from '../../../../../lib/public-links/service';
import { resolveInvoicePublicLink } from '../../../../../lib/public-links/resolve';
import { publicPaymentStatusFromInvoice } from '../../../../../lib/payments/eligibility';
import { jsonError, jsonOk } from '../../../../../lib/security';

export const prerender = false;

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
};

export const GET: APIRoute = async ({ params }) => {
  const rawToken = (params.token ?? '').trim();
  const service = await getPublicCapabilityServiceClient();
  if (!service) {
    return jsonError('Unavailable', 503, privateHeaders);
  }

  const resolved = await resolveInvoicePublicLink(service, rawToken);
  if (!resolved.ok) {
    return jsonError('Unavailable', 404, privateHeaders);
  }

  const status = publicPaymentStatusFromInvoice(resolved.document.invoice);
  // Public-facing fields only — no Stripe IDs, no internal notes.
  return jsonOk(status, 200, privateHeaders);
};
