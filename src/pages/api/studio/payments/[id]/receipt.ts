import type { APIRoute } from 'astro';
import { authorizeStudioApi } from '../../../../../lib/auth/api';
import { isSameOriginMutation, requestSiteOrigin } from '../../../../../lib/auth/origin';
import { jsonError } from '../../../../../lib/security';
import { tryCreateSupabaseServiceClient } from '../../../../../lib/supabase/server';
import { getOrCreateReceiptPdf, ReceiptPdfError } from '../../../../../lib/pdf/receipt';
import { downloadPrivatePdf } from '../../../../../lib/pdf/storage';
import { receiptPdfFilename } from '../../../../../lib/pdf/filenames';
import { pdfDownloadResponse } from '../../../../../lib/pdf/download-response';
import { uuidParamSchema } from '../../../../../lib/invoices/validation';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await authorizeStudioApi(context, 'studio.payments.read');
  if (auth instanceof Response) return auth;
  const supabase = context.locals.studioSupabase;
  if (!supabase) return jsonError('Unauthorized', 401);

  const paymentId = uuidParamSchema.safeParse(context.params.id);
  if (!paymentId.success) return jsonError('Not found', 404);

  const service = tryCreateSupabaseServiceClient() ?? supabase;
  try {
    const { document } = await getOrCreateReceiptPdf(service, {
      paymentId: paymentId.data,
      actorProfileId: auth.profile.id,
    });
    if (document.status !== 'ready') return jsonError('Receipt is not ready yet.', 409);
    const bytes = await downloadPrivatePdf(service as never, document.storage_path);
    const { data: payment } = await supabase
      .from('payments')
      .select('paid_at, invoice_id')
      .eq('id', paymentId.data)
      .maybeSingle();
    const { data: invoice } = payment?.invoice_id
      ? await supabase
          .from('invoices')
          .select('invoice_number')
          .eq('id', payment.invoice_id)
          .maybeSingle()
      : { data: null };
    return pdfDownloadResponse(
      bytes,
      receiptPdfFilename(invoice?.invoice_number || 'Invoice', payment?.paid_at ?? null),
    );
  } catch (error) {
    if (error instanceof ReceiptPdfError) {
      return jsonError(error.message, error.code === 'not_found' ? 404 : 400);
    }
    return jsonError('Unable to download receipt.', 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await authorizeStudioApi(context, 'studio.payments.read');
  if (auth instanceof Response) return auth;
  const supabase = context.locals.studioSupabase;
  if (!supabase) return jsonError('Unauthorized', 401);

  const origin = requestSiteOrigin(context.request, context.url);
  if (!isSameOriginMutation(context.request, origin)) {
    return jsonError('Invalid request origin.', 403);
  }

  const paymentId = uuidParamSchema.safeParse(context.params.id);
  if (!paymentId.success) return jsonError('Not found', 404);

  const service = tryCreateSupabaseServiceClient() ?? supabase;
  try {
    const result = await getOrCreateReceiptPdf(service, {
      paymentId: paymentId.data,
      actorProfileId: auth.profile.id,
    });
    return new Response(JSON.stringify({ ok: true, documentId: result.document.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof ReceiptPdfError) {
      return jsonError(error.message, error.code === 'provider' ? 503 : 400);
    }
    return jsonError('Unable to generate receipt.', 500);
  }
};
