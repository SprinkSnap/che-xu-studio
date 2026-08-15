/**
 * Reminder event queries for admin Invoice detail.
 */

import type { StudioSupabaseClient, StudioSupabaseServiceClient } from '../supabase/types';

type AnyClient = StudioSupabaseClient | StudioSupabaseServiceClient;

export async function listReminderEventsForInvoice(
  client: AnyClient,
  invoiceId: string,
): Promise<
  Array<{
    id: string;
    reminder_type: string;
    scheduled_for: string;
    sent_at: string | null;
    status: string;
    email_log_id: string | null;
    created_at: string;
  }>
> {
  const { data, error } = await client
    .from('reminder_events')
    .select('id, reminder_type, scheduled_for, sent_at, status, email_log_id, created_at')
    .eq('invoice_id', invoiceId)
    .order('scheduled_for', { ascending: true })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}
