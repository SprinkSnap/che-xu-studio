/**
 * Resolve outbound recipient for Proposal / Invoice delivery.
 * Prefer explicit admin override, then version/invoice snapshot, then client profile.
 */

import type { StudioSupabaseClient } from '../supabase/types';

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}

export async function resolveDeliveryRecipient(
  supabase: StudioSupabaseClient,
  input: {
    recipientEmail?: string | null;
    snapshotEmail?: string | null;
    clientId: string;
  },
): Promise<string | null> {
  const candidates = [
    input.recipientEmail?.trim(),
    input.snapshotEmail?.trim(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase();
    if (isValidEmail(normalized)) return normalized;
  }

  const { data: client } = await supabase
    .from('clients')
    .select('billing_email')
    .eq('id', input.clientId)
    .maybeSingle();
  const billing = client?.billing_email?.trim().toLowerCase();
  if (billing && isValidEmail(billing)) return billing;

  const { data: primary } = await supabase
    .from('client_contacts')
    .select('email')
    .eq('client_id', input.clientId)
    .eq('is_primary', true)
    .maybeSingle();
  const primaryEmail = primary?.email?.trim().toLowerCase();
  if (primaryEmail && isValidEmail(primaryEmail)) return primaryEmail;

  return null;
}
