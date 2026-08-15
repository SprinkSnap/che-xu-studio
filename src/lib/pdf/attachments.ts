/**
 * Optional email PDF attachments — fetch private documents at send time.
 * Never persist PDF bytes in email_outbox or email_logs.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import { MAX_EMAIL_ATTACHMENT_BYTES } from '../documents/types';
import { findCanonicalDocument } from './documents';
import { downloadPrivatePdf } from './storage';
import type { EmailAttachment } from '../email/types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export async function studioAttachPdfByDefault(client: AnyClient): Promise<boolean> {
  const { data } = await client
    .from('settings')
    .select('attach_pdf_by_default')
    .limit(1)
    .maybeSingle();
  return data?.attach_pdf_by_default === true;
}

async function attachmentFromDocument(
  client: AnyClient,
  input: {
    resourceType: 'proposal' | 'invoice' | 'receipt';
    resourceId: string;
    documentType: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
    versionId?: string | null;
    filename: string;
  },
): Promise<EmailAttachment | null> {
  const doc = await findCanonicalDocument(client, {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    documentType: input.documentType,
    versionId: input.versionId,
  });
  if (!doc || doc.status !== 'ready') return null;
  if (doc.file_size && doc.file_size > MAX_EMAIL_ATTACHMENT_BYTES) return null;

  try {
    const bytes = await downloadPrivatePdf(client as StudioSupabaseServiceClient, doc.storage_path);
    if (bytes.byteLength > MAX_EMAIL_ATTACHMENT_BYTES) return null;
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return {
      filename: input.filename,
      content: btoa(binary),
      contentType: 'application/pdf',
    };
  } catch {
    return null;
  }
}

export async function maybeProposalPdfAttachment(
  client: AnyClient,
  input: { proposalId: string; versionId: string; filename: string },
): Promise<EmailAttachment | null> {
  if (!(await studioAttachPdfByDefault(client))) return null;
  return attachmentFromDocument(client, {
    resourceType: 'proposal',
    resourceId: input.proposalId,
    documentType: 'proposal_pdf',
    versionId: input.versionId,
    filename: input.filename,
  });
}

export async function maybeInvoicePdfAttachment(
  client: AnyClient,
  input: { invoiceId: string; filename: string },
): Promise<EmailAttachment | null> {
  if (!(await studioAttachPdfByDefault(client))) return null;
  return attachmentFromDocument(client, {
    resourceType: 'invoice',
    resourceId: input.invoiceId,
    documentType: 'invoice_pdf',
    versionId: null,
    filename: input.filename,
  });
}

export async function maybeReceiptPdfAttachment(
  client: AnyClient,
  input: { paymentId: string; filename: string },
): Promise<EmailAttachment | null> {
  if (!(await studioAttachPdfByDefault(client))) return null;
  return attachmentFromDocument(client, {
    resourceType: 'receipt',
    resourceId: input.paymentId,
    documentType: 'receipt_pdf',
    versionId: null,
    filename: input.filename,
  });
}
