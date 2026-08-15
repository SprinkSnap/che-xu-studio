/**
 * Document job enqueue + processing (PDF side effects).
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { getOrCreateProposalPdf } from './proposal';
import { getOrCreateInvoicePdf } from './invoice';
import { getOrCreateReceiptPdf } from './receipt';

export type DocumentJobRow = {
  id: string;
  document_type: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
  resource_type: 'proposal' | 'invoice' | 'receipt';
  resource_id: string;
  version_id: string | null;
  payment_id: string | null;
  idempotency_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  created_by: string | null;
};

function nextAttemptAt(attemptCount: number, now = new Date()): string {
  const minutes = [5, 30, 120, 720, 1440][Math.min(attemptCount, 4)] ?? 1440;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export async function enqueueDocumentJob(
  client: StudioSupabaseServiceClient | import('../supabase/types').StudioSupabaseClient,
  input: {
    documentType: 'proposal_pdf' | 'invoice_pdf' | 'receipt_pdf';
    resourceType: 'proposal' | 'invoice' | 'receipt';
    resourceId: string;
    versionId?: string | null;
    paymentId?: string | null;
    idempotencyKey: string;
    createdBy?: string | null;
  },
): Promise<{ id: string; created: boolean }> {
  const { data, error } = await client
    .from('document_jobs')
    .insert({
      document_type: input.documentType,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      version_id: input.versionId ?? null,
      payment_id: input.paymentId ?? null,
      idempotency_key: input.idempotencyKey,
      created_by: input.createdBy ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (!error && data) return { id: data.id, created: true };

  const existing = await client
    .from('document_jobs')
    .select('id')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing.data) return { id: existing.data.id, created: false };
  throw new Error(error?.message || 'Unable to enqueue document job');
}

export async function claimDocumentJobBatch(
  service: StudioSupabaseServiceClient,
  limit = 10,
): Promise<DocumentJobRow[]> {
  const now = new Date().toISOString();
  const { data } = await service
    .from('document_jobs')
    .select(
      'id, document_type, resource_type, resource_id, version_id, payment_id, idempotency_key, status, attempt_count, max_attempts, created_by',
    )
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  const claimed: DocumentJobRow[] = [];
  for (const row of data ?? []) {
    const { data: updated } = await service
      .from('document_jobs')
      .update({
        status: 'processing',
        attempt_count: row.attempt_count + 1,
      })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .select(
        'id, document_type, resource_type, resource_id, version_id, payment_id, idempotency_key, status, attempt_count, max_attempts, created_by',
      )
      .maybeSingle();
    if (updated) claimed.push(updated as DocumentJobRow);
  }
  return claimed;
}

async function processOneJob(
  service: StudioSupabaseServiceClient,
  job: DocumentJobRow,
): Promise<void> {
  try {
    let documentId: string | null = null;
    if (job.document_type === 'proposal_pdf') {
      if (!job.version_id) throw new Error('proposal version required');
      const result = await getOrCreateProposalPdf(service, {
        proposalId: job.resource_id,
        versionId: job.version_id,
        actorProfileId: job.created_by,
      });
      documentId = result.document.id;
    } else if (job.document_type === 'invoice_pdf') {
      const result = await getOrCreateInvoicePdf(service, {
        invoiceId: job.resource_id,
        actorProfileId: job.created_by,
      });
      documentId = result.document.id;
    } else {
      const paymentId = job.payment_id || job.resource_id;
      const result = await getOrCreateReceiptPdf(service, {
        paymentId,
        actorProfileId: job.created_by,
      });
      documentId = result.document.id;
    }

    await service
      .from('document_jobs')
      .update({
        status: 'ready',
        document_id: documentId,
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'document-job-failed';
    const attempts = job.attempt_count;
    const terminal = attempts >= job.max_attempts;
    await service
      .from('document_jobs')
      .update({
        status: terminal ? 'failed' : 'pending',
        last_error: message.slice(0, 500),
        next_attempt_at: nextAttemptAt(attempts),
      })
      .eq('id', job.id);
  }
}

export async function processDocumentJobs(
  service: StudioSupabaseServiceClient,
  limit = 10,
): Promise<{ processed: number; ready: number; failed: number }> {
  const batch = await claimDocumentJobBatch(service, limit);
  let ready = 0;
  let failed = 0;
  for (const job of batch) {
    await processOneJob(service, job);
    const { data } = await service
      .from('document_jobs')
      .select('status')
      .eq('id', job.id)
      .maybeSingle();
    if (data?.status === 'ready') ready += 1;
    else if (data?.status === 'failed' || data?.status === 'pending') failed += 1;
  }
  return { processed: batch.length, ready, failed };
}
