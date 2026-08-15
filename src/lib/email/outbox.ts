/**
 * Email outbox — enqueue intents and claim/process with retries.
 * Never store raw capability tokens in payload.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import type { Json } from '../supabase/database.types';
import type { OutboxEnqueueInput, OutboxStatus } from './types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export type OutboxRow = {
  id: string;
  email_type: string;
  recipient_email: string;
  resource_type: string;
  resource_id: string;
  client_id: string | null;
  project_id: string | null;
  proposal_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  idempotency_key: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  email_log_id: string | null;
};

/** Backoff minutes: 5, 30, 120, 720, then stop at max_attempts. */
export function nextAttemptAt(attemptCount: number, now = new Date()): string {
  const minutes = [5, 30, 120, 720, 1440][Math.min(attemptCount, 4)] ?? 1440;
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export async function enqueueEmailOutbox(
  client: AnyClient,
  input: OutboxEnqueueInput,
): Promise<{ id: string; created: boolean }> {
  const payload: Record<string, Json> = {};
  if (input.payload) {
    for (const [key, value] of Object.entries(input.payload)) {
      if (value !== undefined) payload[key] = value as Json;
    }
  }

  const { data, error } = await client
    .from('email_outbox')
    .insert({
      email_type: input.emailType,
      recipient_email: input.recipientEmail.trim().toLowerCase(),
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      client_id: input.clientId ?? null,
      project_id: input.projectId ?? null,
      proposal_id: input.proposalId ?? null,
      invoice_id: input.invoiceId ?? null,
      payment_id: input.paymentId ?? null,
      idempotency_key: input.idempotencyKey,
      payload,
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (!error && data) {
    return { id: data.id, created: true };
  }

  // Unique conflict → already enqueued
  const existing = await client
    .from('email_outbox')
    .select('id')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing.data) {
    return { id: existing.data.id, created: false };
  }

  throw new Error(error?.message || 'Unable to enqueue email');
}

/**
 * Claim a batch of due outbox rows (status pending|failed, next_attempt_at <= now).
 * Optimistic claim via status flip to processing.
 */
export async function claimOutboxBatch(
  service: StudioSupabaseServiceClient,
  limit = 20,
): Promise<OutboxRow[]> {
  const now = new Date().toISOString();
  const { data: candidates, error } = await service
    .from('email_outbox')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', now)
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!candidates?.length) return [];

  const claimed: OutboxRow[] = [];
  for (const row of candidates) {
    if (row.attempt_count >= row.max_attempts && row.status === 'failed') {
      continue;
    }
    const { data: updated } = await service
      .from('email_outbox')
      .update({
        status: 'processing',
        attempt_count: row.attempt_count + 1,
      })
      .eq('id', row.id)
      .in('status', ['pending', 'failed'])
      .select('*')
      .maybeSingle();
    if (updated) {
      claimed.push({
        ...updated,
        payload: (updated.payload ?? {}) as Record<string, unknown>,
        status: updated.status as OutboxStatus,
      });
    }
  }
  return claimed;
}

export async function markOutboxSent(
  service: StudioSupabaseServiceClient,
  outboxId: string,
  emailLogId: string | null,
): Promise<void> {
  await service
    .from('email_outbox')
    .update({
      status: 'sent',
      processed_at: new Date().toISOString(),
      email_log_id: emailLogId,
      last_error: null,
    })
    .eq('id', outboxId);
}

export async function markOutboxFailed(
  service: StudioSupabaseServiceClient,
  row: OutboxRow,
  error: string,
  retryable: boolean,
): Promise<void> {
  const terminal = !retryable || row.attempt_count >= row.max_attempts;
  await service
    .from('email_outbox')
    .update({
      status: terminal ? 'failed' : 'pending',
      last_error: error.slice(0, 500),
      next_attempt_at: terminal
        ? new Date().toISOString()
        : nextAttemptAt(row.attempt_count),
      processed_at: terminal ? new Date().toISOString() : null,
    })
    .eq('id', row.id);
}

export async function markOutboxSkipped(
  service: StudioSupabaseServiceClient,
  outboxId: string,
  reason: string,
): Promise<void> {
  await service
    .from('email_outbox')
    .update({
      status: 'skipped',
      last_error: reason.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq('id', outboxId);
}
