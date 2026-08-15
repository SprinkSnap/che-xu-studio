import type { APIRoute } from 'astro';
import { getPublicCapabilityServiceClient } from '../../../lib/public-links/service';
import { resolveProposalPublicLink } from '../../../lib/public-links/resolve';
import { getOrCreateProposalPdf } from '../../../lib/pdf/proposal';
import { downloadPrivatePdf } from '../../../lib/pdf/storage';
import { proposalPdfFilename } from '../../../lib/pdf/filenames';
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

  const resolved = await resolveProposalPublicLink(service, rawToken);
  if (!resolved.ok) {
    return new Response('Not found', { status: 404, headers: privateHeaders });
  }

  try {
    const { document } = await getOrCreateProposalPdf(service, {
      proposalId: resolved.document.proposal.id,
      versionId: resolved.document.version.id,
      actorProfileId: null,
    });
    if (document.status !== 'ready') {
      return new Response('PDF is not available yet.', { status: 409, headers: privateHeaders });
    }
    // Exact Version binding — reject mismatch
    if (document.version_id !== resolved.document.version.id) {
      return new Response('Not found', { status: 404, headers: privateHeaders });
    }
    const bytes = await downloadPrivatePdf(service, document.storage_path);
    return pdfDownloadResponse(
      bytes,
      proposalPdfFilename(
        resolved.document.proposal.proposal_number,
        resolved.document.version.version_number,
      ),
    );
  } catch {
    return new Response('Unable to download PDF.', { status: 500, headers: privateHeaders });
  }
};
