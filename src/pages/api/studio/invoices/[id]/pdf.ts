import type { APIRoute } from 'astro';
import { authorizeStudioApi } from '../../../../../lib/auth/api';
import { roleHasPermission } from '../../../../../lib/auth/permissions';
import { isSameOriginMutation, requestSiteOrigin } from '../../../../../lib/auth/origin';
import { jsonError } from '../../../../../lib/security';
import { tryCreateSupabaseServiceClient } from '../../../../../lib/supabase/server';
import { getOrCreateInvoicePdf, InvoicePdfError } from '../../../../../lib/pdf/invoice';
import { downloadPrivatePdf } from '../../../../../lib/pdf/storage';
import { invoicePdfFilename } from '../../../../../lib/pdf/filenames';
import { pdfDownloadResponse } from '../../../../../lib/pdf/download-response';
import { uuidParamSchema } from '../../../../../lib/invoices/validation';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await authorizeStudioApi(context, 'studio.invoices.read');
  if (auth instanceof Response) return auth;
  const supabase = context.locals.studioSupabase;
  if (!supabase) return jsonError('Unauthorized', 401);

  const invoiceId = uuidParamSchema.safeParse(context.params.id);
  if (!invoiceId.success) return jsonError('Not found', 404);

  const service = tryCreateSupabaseServiceClient() ?? supabase;
  try {
    const { document } = await getOrCreateInvoicePdf(service, {
      invoiceId: invoiceId.data,
      actorProfileId: auth.profile.id,
    });
    if (document.status !== 'ready') return jsonError('PDF is not ready yet.', 409);
    const bytes = await downloadPrivatePdf(service as never, document.storage_path);
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('id', invoiceId.data)
      .maybeSingle();
    return pdfDownloadResponse(bytes, invoicePdfFilename(invoice?.invoice_number || 'Invoice'));
  } catch (error) {
    if (error instanceof InvoicePdfError) {
      return jsonError(error.message, error.code === 'not_found' ? 404 : 400);
    }
    return jsonError('Unable to download PDF.', 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await authorizeStudioApi(context, 'studio.invoices.write');
  if (auth instanceof Response) return auth;
  const supabase = context.locals.studioSupabase;
  if (!supabase) return jsonError('Unauthorized', 401);

  const origin = requestSiteOrigin(context.request, context.url);
  if (!isSameOriginMutation(context.request, origin)) {
    return jsonError('Invalid request origin.', 403);
  }

  const invoiceId = uuidParamSchema.safeParse(context.params.id);
  if (!invoiceId.success) return jsonError('Not found', 404);

  const body = await context.request.json().catch(() => ({}));
  const force =
    Boolean((body as { regenerate?: boolean }).regenerate) &&
    roleHasPermission(auth.profile.role, 'studio.invoices.write');

  const service = tryCreateSupabaseServiceClient() ?? supabase;
  try {
    const result = await getOrCreateInvoicePdf(service, {
      invoiceId: invoiceId.data,
      actorProfileId: auth.profile.id,
      forceRegenerate: force,
    });
    return new Response(JSON.stringify({ ok: true, documentId: result.document.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof InvoicePdfError) {
      return jsonError(error.message, error.code === 'provider' ? 503 : 400);
    }
    return jsonError('Unable to generate PDF.', 500);
  }
};
