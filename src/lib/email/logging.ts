/**
 * Persist email_logs rows (provider acceptance semantics).
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';
import type { Json } from '../supabase/database.types';
import type { EmailDeliveryStatus, StudioEmailType } from './types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export async function insertQueuedEmailLog(
  client: AnyClient,
  input: {
    emailType: StudioEmailType;
    recipientEmail: string;
    subject: string;
    idempotencyKey: string;
    clientId?: string | null;
    projectId?: string | null;
    proposalId?: string | null;
    invoiceId?: string | null;
    metadata?: Record<string, Json | undefined>;
  },
): Promise<{ id: string; created: boolean; status: EmailDeliveryStatus }> {
  const metadata: Record<string, Json> = {};
  if (input.metadata) {
    for (const [k, v] of Object.entries(input.metadata)) {
      if (v !== undefined) metadata[k] = v;
    }
  }

  const { data, error } = await client
    .from('email_logs')
    .insert({
      email_type: input.emailType,
      recipient_email: input.recipientEmail.trim().toLowerCase(),
      subject: input.subject,
      status: 'queued',
      idempotency_key: input.idempotencyKey,
      client_id: input.clientId ?? null,
      project_id: input.projectId ?? null,
      proposal_id: input.proposalId ?? null,
      invoice_id: input.invoiceId ?? null,
      metadata,
      attempt_count: 0,
    })
    .select('id, status')
    .single();

  if (!error && data) {
    return {
      id: data.id,
      created: true,
      status: data.status as EmailDeliveryStatus,
    };
  }

  const existing = await client
    .from('email_logs')
    .select('id, status')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing.data) {
    return {
      id: existing.data.id,
      created: false,
      status: existing.data.status as EmailDeliveryStatus,
    };
  }

  throw new Error(error?.message || 'Unable to create email log');
}

export async function markEmailLogSent(
  client: AnyClient,
  emailLogId: string,
  providerMessageId: string,
): Promise<void> {
  await client
    .from('email_logs')
    .update({
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq('id', emailLogId)
    .in('status', ['queued', 'failed']);
}

export async function markEmailLogFailed(
  client: AnyClient,
  emailLogId: string,
  reason: string,
): Promise<void> {
  await client
    .from('email_logs')
    .update({
      status: 'failed',
      failure_reason: reason.slice(0, 500),
    })
    .eq('id', emailLogId)
    .neq('status', 'sent');
}

export async function listEmailLogsForProposal(
  client: AnyClient,
  proposalId: string,
): Promise<
  Array<{
    id: string;
    email_type: string;
    recipient_email: string;
    subject: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    failure_reason: string | null;
    provider_message_id: string | null;
  }>
> {
  const { data, error } = await client
    .from('email_logs')
    .select(
      'id, email_type, recipient_email, subject, status, sent_at, created_at, failure_reason, provider_message_id',
    )
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

export async function listEmailLogsForInvoice(
  client: AnyClient,
  invoiceId: string,
): Promise<
  Array<{
    id: string;
    email_type: string;
    recipient_email: string;
    subject: string;
    status: string;
    sent_at: string | null;
    created_at: string;
    failure_reason: string | null;
    provider_message_id: string | null;
  }>
> {
  const { data, error } = await client
    .from('email_logs')
    .select(
      'id, email_type, recipient_email, subject, status, sent_at, created_at, failure_reason, provider_message_id',
    )
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}
