import type { APIRoute } from 'astro';
import { authorizeStudioApi } from '../../../../../lib/auth/api';
import { roleHasPermission } from '../../../../../lib/auth/permissions';
import { isSameOriginMutation, requestSiteOrigin } from '../../../../../lib/auth/origin';
import { jsonError } from '../../../../../lib/security';
import { tryCreateSupabaseServiceClient } from '../../../../../lib/supabase/server';
import { getOrCreateProposalPdf, ProposalPdfError } from '../../../../../lib/pdf/proposal';
import { downloadPrivatePdf } from '../../../../../lib/pdf/storage';
import { proposalPdfFilename } from '../../../../../lib/pdf/filenames';
import { pdfDownloadResponse } from '../../../../../lib/pdf/download-response';
import { uuidParamSchema } from '../../../../../lib/proposals/validation';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await authorizeStudioApi(context, 'studio.proposals.read');
  if (auth instanceof Response) return auth;
  const supabase = context.locals.studioSupabase;
  if (!supabase) return jsonError('Unauthorized', 401);

  const proposalId = uuidParamSchema.safeParse(context.params.id);
  const versionId = uuidParamSchema.safeParse(context.url.searchParams.get('versionId'));
  if (!proposalId.success || !versionId.success) {
    return jsonError('Not found', 404);
  }

  const service = tryCreateSupabaseServiceClient() ?? supabase;
  try {
    const { document } = await getOrCreateProposalPdf(service, {
      proposalId: proposalId.data,
      versionId: versionId.data,
      actorProfileId: auth.profile.id,
    });
    if (document.status !== 'ready') {
      return jsonError('PDF is not ready yet.', 409);
    }
    const bytes = await downloadPrivatePdf(service as never, document.storage_path);
    const { data: version } = await supabase
      .from('proposal_versions')
      .select('version_number')
      .eq('id', versionId.data)
      .maybeSingle();
    const { data: proposal } = await supabase
      .from('proposals')
      .select('proposal_number')
      .eq('id', proposalId.data)
      .maybeSingle();
    return pdfDownloadResponse(
      bytes,
      proposalPdfFilename(proposal?.proposal_number || 'Proposal', version?.version_number || 1),
    );
  } catch (error) {
    if (error instanceof ProposalPdfError) {
      return jsonError(error.message, error.code === 'not_found' ? 404 : 400);
    }
    return jsonError('Unable to download PDF.', 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await authorizeStudioApi(context, 'studio.proposals.write');
  if (auth instanceof Response) return auth;
  const supabase = context.locals.studioSupabase;
  if (!supabase) return jsonError('Unauthorized', 401);

  const origin = requestSiteOrigin(context.request, context.url);
  if (!isSameOriginMutation(context.request, origin)) {
    return jsonError('Invalid request origin.', 403);
  }

  const proposalId = uuidParamSchema.safeParse(context.params.id);
  if (!proposalId.success) return jsonError('Not found', 404);

  const body = await context.request.json().catch(() => ({}));
  const versionId = uuidParamSchema.safeParse(
    (body as { versionId?: string }).versionId ?? context.url.searchParams.get('versionId'),
  );
  if (!versionId.success) return jsonError('versionId required', 400);

  const force =
    Boolean((body as { regenerate?: boolean }).regenerate) &&
    roleHasPermission(auth.profile.role, 'studio.proposals.write');

  const service = tryCreateSupabaseServiceClient() ?? supabase;
  try {
    const result = await getOrCreateProposalPdf(service, {
      proposalId: proposalId.data,
      versionId: versionId.data,
      actorProfileId: auth.profile.id,
      forceRegenerate: force,
    });
    return new Response(JSON.stringify({ ok: true, documentId: result.document.id }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof ProposalPdfError) {
      return jsonError(error.message, error.code === 'provider' ? 503 : 400);
    }
    return jsonError('Unable to generate PDF.', 500);
  }
};
