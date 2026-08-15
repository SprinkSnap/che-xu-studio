import type { APIRoute } from 'astro';
import { getPublicCapabilityServiceClient } from '../../../lib/public-links/service';
import { resolveInvoicePublicLink } from '../../../lib/public-links/resolve';
import { getOrCreateInvoicePdf } from '../../../lib/pdf/invoice';
import { downloadPrivatePdf } from '../../../lib/pdf/storage';
import { invoicePdfFilename } from '../../../lib/pdf/filenames';
import { pdfDownloadResponse } from '../../../lib/pdf/download-response';

export const prerender = false;

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
};

export const GET: APIRoute = async ({ params }) => {
  const rawToken = params.token ?? '';
  const service = await getPublicCapabilityServiceClient();
  if (!service) {
    return new Response('Unavailable', { status: 503, headers: privateHeaders });
  }

  const resolved = await resolveInvoicePublicLink(service, rawToken);
  if (!resolved.ok) {
    return new Response('Not found', { status: 404, headers: privateHeaders });
  }

  try {
    const { document } = await getOrCreateInvoicePdf(service, {
      invoiceId: resolved.document.invoice.id,
      actorProfileId: null,
    });
    if (document.status !== 'ready') {
      return new Response('PDF is not available yet.', { status: 409, headers: privateHeaders });
    }
    if (document.resource_id !== resolved.document.invoice.id) {
      return new Response('Not found', { status: 404, headers: privateHeaders });
    }
    const bytes = await downloadPrivatePdf(service, document.storage_path);
    return pdfDownloadResponse(
      bytes,
      invoicePdfFilename(resolved.document.invoice.invoice_number),
    );
  } catch {
    return new Response('Unable to download PDF.', { status: 500, headers: privateHeaders });
  }
};
