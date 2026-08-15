/**
 * Canonical Invoice PDF — issued Invoice snapshot (immutable after issue).
 * Payment state does not rewrite the issued PDF.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import { buildInvoiceDocumentViewModel } from '../documents/invoice-view-model';
import { renderInvoiceDocumentHtml } from '../documents/html';
import type { CurrencyCode } from '../supabase/domain';
import { recordStudioActivity } from '../studio/activity';
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '../invoices/workflow';
import { renderHtmlToPdf } from './renderer';
import { buildInvoiceStoragePath, uploadPrivatePdf } from './storage';
import {
  findCanonicalDocument,
  markDocumentFailed,
  markDocumentReady,
  reserveCanonicalDocument,
  supersedeCanonicalDocument,
} from './documents';
import { sha256Hex, type CanonicalDocumentRow } from './types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export class InvoicePdfError extends Error {
  readonly code: 'not_found' | 'invalid' | 'provider' | 'failed';

  constructor(code: InvoicePdfError['code'], message: string) {
    super(message);
    this.name = 'InvoicePdfError';
    this.code = code;
  }
}

export async function getOrCreateInvoicePdf(
  client: AnyClient,
  input: {
    invoiceId: string;
    actorProfileId?: string | null;
    forceRegenerate?: boolean;
    browser?: unknown;
  },
): Promise<{ document: CanonicalDocumentRow; created: boolean }> {
  const { data: invoice, error } = await client
    .from('invoices')
    .select(
      `id, invoice_number, invoice_type, status, currency, issue_date, due_date,
       subtotal_minor, discount_minor, tax_minor, tax_bps, total_minor,
       amount_paid_minor, balance_due_minor, payment_instructions,
       client_display_name, client_contact_name, client_contact_email, client_billing_address,
       project_name, studio_business_name, studio_billing_email, studio_business_address,
       client_id, project_id, voided_at`,
    )
    .eq('id', input.invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    throw new InvoicePdfError('not_found', 'Invoice not found.');
  }
  if (invoice.status === 'draft') {
    throw new InvoicePdfError('invalid', 'Issue the invoice before generating a canonical PDF.');
  }
  if (invoice.status === 'void' || invoice.voided_at) {
    throw new InvoicePdfError('invalid', 'Void invoices cannot generate a new PDF.');
  }

  const existing = await findCanonicalDocument(client, {
    resourceType: 'invoice',
    resourceId: invoice.id,
    documentType: 'invoice_pdf',
    versionId: null,
  });

  if (existing?.status === 'ready' && !input.forceRegenerate) {
    return { document: existing, created: false };
  }

  if (input.forceRegenerate && existing?.status === 'ready') {
    await supersedeCanonicalDocument(client, existing.id);
  }

  const reserved = await reserveCanonicalDocument(client, {
    resourceType: 'invoice',
    resourceId: invoice.id,
    documentType: 'invoice_pdf',
    versionId: null,
    createdBy: input.actorProfileId ?? null,
    storagePathPlaceholder: `invoices/${invoice.id}/pending.pdf`,
    generationVersion:
      input.forceRegenerate && existing ? existing.generation_version + 1 : undefined,
    metadata: { invoice_number: invoice.invoice_number },
  });

  if (reserved.row.status === 'ready') {
    return { document: reserved.row, created: false };
  }

  const { data: items } = await client
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('sort_order', { ascending: true });

  // Canonical issued PDF is the commercial issued document — not a live payment ledger.
  // Payment evidence belongs on Receipt PDFs. Automatic reuse never rewrites this file;
  // explicit regenerate creates a new generation while preserving history.
  const statusKey = invoice.status as InvoiceStatus;
  const issuedStatusLabel =
    statusKey === 'void' ? INVOICE_STATUS_LABELS.void : INVOICE_STATUS_LABELS.issued;
  const vm = buildInvoiceDocumentViewModel({
    invoiceNumber: invoice.invoice_number,
    invoiceType: invoice.invoice_type,
    statusLabel: issuedStatusLabel,
    clientDisplayName: invoice.client_display_name || '',
    clientContactName: invoice.client_contact_name,
    clientContactEmail: invoice.client_contact_email,
    clientBillingAddress: invoice.client_billing_address,
    projectName: invoice.project_name,
    studioBusinessName: invoice.studio_business_name,
    studioBillingEmail: invoice.studio_billing_email,
    studioBusinessAddress: invoice.studio_business_address,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    items: items ?? [],
    subtotalMinor: invoice.subtotal_minor,
    discountMinor: invoice.discount_minor,
    taxMinor: invoice.tax_minor,
    taxBps: invoice.tax_bps,
    totalMinor: invoice.total_minor,
    amountPaidMinor: 0,
    balanceDueMinor: invoice.total_minor,
    currency: invoice.currency as CurrencyCode,
    paymentInstructions: invoice.payment_instructions,
    showPayPlaceholder: false,
  });

  const html = renderInvoiceDocumentHtml(vm);
  const rendered = await renderHtmlToPdf(html, { browser: input.browser as never });
  if (!rendered.ok) {
    await markDocumentFailed(client, reserved.row.id, rendered.error);
    await recordStudioActivity(client, {
      actorProfileId: input.actorProfileId ?? null,
      action: 'document.generation_failed',
      clientId: invoice.client_id,
      projectId: invoice.project_id,
      subjectType: 'invoice',
      subjectId: invoice.id,
      metadata: { document_type: 'invoice_pdf', error: rendered.error },
    });
    throw new InvoicePdfError('provider', rendered.error);
  }

  const checksum = await sha256Hex(rendered.bytes);
  const storagePath = buildInvoiceStoragePath({
    invoiceId: invoice.id,
    documentId: reserved.row.id,
  });

  try {
    await uploadPrivatePdf(client as StudioSupabaseServiceClient, {
      path: storagePath,
      bytes: rendered.bytes,
    });
  } catch {
    await markDocumentFailed(client, reserved.row.id, 'storage-upload-failed');
    throw new InvoicePdfError('failed', 'Unable to store PDF.');
  }

  await markDocumentReady(client, {
    documentId: reserved.row.id,
    storagePath,
    fileSize: rendered.bytes.byteLength,
    checksum,
  });

  await recordStudioActivity(client, {
    actorProfileId: input.actorProfileId ?? null,
    action: input.forceRegenerate ? 'invoice.pdf_regenerated' : 'invoice.pdf_generated',
    clientId: invoice.client_id,
    projectId: invoice.project_id,
    subjectType: 'invoice',
    subjectId: invoice.id,
    metadata: {
      document_id: reserved.row.id,
      generation_version: reserved.row.generation_version,
      file_size: rendered.bytes.byteLength,
    },
  });

  const ready = await findCanonicalDocument(client, {
    resourceType: 'invoice',
    resourceId: invoice.id,
    documentType: 'invoice_pdf',
    versionId: null,
  });
  if (!ready || ready.status !== 'ready') {
    throw new InvoicePdfError('failed', 'PDF metadata was not finalized.');
  }
  return { document: ready, created: true };
}
