/**
 * Studio activity logging (clients and future domains).
 * Never store passwords, tokens, full addresses, notes, phones, or emails in metadata.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/database.types';

export type StudioActivityAction =
  | 'client.created'
  | 'client.updated'
  | 'client.archived'
  | 'client.restored'
  | 'client.contact_added'
  | 'client.contact_updated'
  | 'client.contact_removed'
  | 'client.primary_contact_changed';

type ActivityClient = SupabaseClient<Database>;

export async function recordStudioActivity(
  client: ActivityClient,
  input: {
    actorProfileId?: string | null;
    action: StudioActivityAction;
    clientId?: string | null;
    subjectType?: string;
    subjectId?: string | null;
    metadata?: Record<string, Json | undefined>;
  },
): Promise<void> {
  try {
    const metadata: Record<string, Json> = {};
    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        if (value !== undefined) metadata[key] = value;
      }
    }

    await client.from('activity_logs').insert({
      actor_user_id: input.actorProfileId ?? null,
      actor_type: input.actorProfileId ? 'user' : 'system',
      client_id: input.clientId ?? null,
      action: input.action,
      subject_type: input.subjectType ?? 'client',
      subject_id: input.subjectId ?? input.clientId ?? null,
      metadata,
    });
  } catch {
    // Best-effort — never break UX.
  }
}

export function humanizeStudioActivity(action: string): string {
  const map: Record<string, string> = {
    'client.created': 'Client created',
    'client.updated': 'Client updated',
    'client.archived': 'Client archived',
    'client.restored': 'Client restored',
    'client.contact_added': 'Contact added',
    'client.contact_updated': 'Contact updated',
    'client.contact_removed': 'Contact removed',
    'client.primary_contact_changed': 'Primary contact changed',
  };
  return map[action] ?? action.replace(/\./g, ' ');
}
