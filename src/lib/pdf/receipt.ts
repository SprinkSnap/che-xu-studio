/**
 * Receipt PDF — bound to a successful Payment (not a rewrite of Invoice PDF).
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import { buildReceiptDocumentViewModel } from '../documents/receipt-view-model';
import { renderReceiptDocumentHtml } from '../documents/html';
import type { CurrencyCode } from '../supabase/domain';
import { recordStudioActivity } from '../studio/activity';
import { renderHtmlToPdf } from './renderer';
import { buildReceiptStoragePath, uploadPrivatePdf } from './storage';
import {
  findCanonicalDocument,
  markDocumentFailed,
  markDocumentReady,
  reserveCanonicalDocument,
  supersedeCanonicalDocument,
} from './documents';
import { sha256Hex, type CanonicalDocumentRow } from './types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export class ReceiptPdfError extends Error {
  readonly code: 'not_found' | 'invalid' | 'provider' | 'failed';

  constructor(code: ReceiptPdfError['code'], message: string) {
    super(message);
    this.name = 'ReceiptPdfError';
    this.code = code;
  }
}

export async function getOrCreateReceiptPdf(
  client: AnyClient,
  input: {
    paymentId: string;
    actorProfileId?: string | null;
    forceRegenerate?: boolean;
    browser?: unknown;
  },
): Promise<{ document: CanonicalDocumentRow; created: boolean }> {
  const { data: payment, error } = await client
    .from('payments')
    .select(
      'id, invoice_id, client_id, amount_minor, currency, status, paid_at, payment_method',
    )
    .eq('id', input.paymentId)
    .maybeSingle();

  if (error || !payment) {
    throw new ReceiptPdfError('not_found', 'Payment not found.');
  }
  if (payment.status !== 'succeeded') {
    throw new ReceiptPdfError('invalid', 'Receipts are only available for successful payments.');
  }

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select(
      `id, invoice_number, total_minor, balance_due_minor, currency, project_id,
       client_display_name, project_name, studio_business_name, studio_billing_email`,
    )
    .eq('id', payment.invoice_id)
    .maybeSingle();
  if (invoiceError || !invoice) {
    throw new ReceiptPdfError('not_found', 'Invoice for payment not found.');
  }

  const existing = await findCanonicalDocument(client, {
    resourceType: 'receipt',
    resourceId: payment.id,
    documentType: 'receipt_pdf',
    versionId: null,
  });

  if (existing?.status === 'ready' && !input.forceRegenerate) {
    return { document: existing, created: false };
  }

  if (input.forceRegenerate && existing?.status === 'ready') {
    await supersedeCanonicalDocument(client, existing.id);
  }

  const reserved = await reserveCanonicalDocument(client, {
    resourceType: 'receipt',
    resourceId: payment.id,
    documentType: 'receipt_pdf',
    versionId: null,
    createdBy: input.actorProfileId ?? null,
    storagePathPlaceholder: `receipts/${payment.id}/pending.pdf`,
    generationVersion:
      input.forceRegenerate && existing ? existing.generation_version + 1 : undefined,
    metadata: { invoice_id: invoice.id, invoice_number: invoice.invoice_number },
  });

  if (reserved.row.status === 'ready') {
    return { document: reserved.row, created: false };
  }

  const vm = buildReceiptDocumentViewModel({
    invoiceNumber: invoice.invoice_number,
    paymentId: payment.id,
    paidAt: payment.paid_at,
    clientDisplayName: invoice.client_display_name || '',
    projectName: invoice.project_name,
    studioBusinessName: invoice.studio_business_name,
    studioBillingEmail: invoice.studio_billing_email,
    amountReceivedMinor: payment.amount_minor,
    invoiceTotalMinor: invoice.total_minor,
    balanceDueMinor: invoice.balance_due_minor,
    currency: (payment.currency || invoice.currency) as CurrencyCode,
    paymentMethod: payment.payment_method,
  });

  const html = renderReceiptDocumentHtml(vm);
  const rendered = await renderHtmlToPdf(html, { browser: input.browser as never });
  if (!rendered.ok) {
    await markDocumentFailed(client, reserved.row.id, rendered.error);
    await recordStudioActivity(client, {
      actorProfileId: input.actorProfileId ?? null,
      action: 'document.generation_failed',
      clientId: payment.client_id,
      projectId: invoice.project_id,
      subjectType: 'payment',
      subjectId: payment.id,
      metadata: { document_type: 'receipt_pdf', error: rendered.error },
    });
    throw new ReceiptPdfError('provider', rendered.error);
  }

  const checksum = await sha256Hex(rendered.bytes);
  const storagePath = buildReceiptStoragePath({
    paymentId: payment.id,
    documentId: reserved.row.id,
  });

  try {
    await uploadPrivatePdf(client as StudioSupabaseServiceClient, {
      path: storagePath,
      bytes: rendered.bytes,
    });
  } catch {
    await markDocumentFailed(client, reserved.row.id, 'storage-upload-failed');
    throw new ReceiptPdfError('failed', 'Unable to store PDF.');
  }

  await markDocumentReady(client, {
    documentId: reserved.row.id,
    storagePath,
    fileSize: rendered.bytes.byteLength,
    checksum,
  });

  await recordStudioActivity(client, {
    actorProfileId: input.actorProfileId ?? null,
    action: 'payment.receipt_generated',
    clientId: payment.client_id,
    projectId: invoice.project_id,
    subjectType: 'payment',
    subjectId: payment.id,
    metadata: {
      document_id: reserved.row.id,
      invoice_id: invoice.id,
      file_size: rendered.bytes.byteLength,
    },
  });

  const ready = await findCanonicalDocument(client, {
    resourceType: 'receipt',
    resourceId: payment.id,
    documentType: 'receipt_pdf',
    versionId: null,
  });
  if (!ready || ready.status !== 'ready') {
    throw new ReceiptPdfError('failed', 'Receipt metadata was not finalized.');
  }
  return { document: ready, created: true };
}
