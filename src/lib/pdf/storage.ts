/**
 * Private PDF storage — Supabase Storage bucket studio-documents.
 * All access is service-role mediated; never public.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { STUDIO_DOCUMENTS_BUCKET } from '../documents/types';

export function buildProposalStoragePath(input: {
  proposalId: string;
  versionId: string;
  documentId: string;
}): string {
  return `proposals/${input.proposalId}/versions/${input.versionId}/${input.documentId}.pdf`;
}

export function buildInvoiceStoragePath(input: {
  invoiceId: string;
  documentId: string;
}): string {
  return `invoices/${input.invoiceId}/${input.documentId}.pdf`;
}

export function buildReceiptStoragePath(input: {
  paymentId: string;
  documentId: string;
}): string {
  return `receipts/${input.paymentId}/${input.documentId}.pdf`;
}

export async function uploadPrivatePdf(
  service: StudioSupabaseServiceClient,
  input: { path: string; bytes: Uint8Array; upsert?: boolean },
): Promise<void> {
  const { error } = await service.storage.from(STUDIO_DOCUMENTS_BUCKET).upload(input.path, input.bytes, {
    contentType: 'application/pdf',
    upsert: input.upsert ?? true,
  });
  if (error) throw new Error(error.message || 'storage-upload-failed');
}

export async function downloadPrivatePdf(
  service: StudioSupabaseServiceClient,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await service.storage.from(STUDIO_DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || 'storage-download-failed');
  const buffer = await data.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function removePrivatePdf(
  service: StudioSupabaseServiceClient,
  path: string,
): Promise<void> {
  await service.storage.from(STUDIO_DOCUMENTS_BUCKET).remove([path]);
}
