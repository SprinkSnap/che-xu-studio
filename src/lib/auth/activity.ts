/**
 * Authentication activity logging (Phase 4 activity_logs).
 * Never pass passwords, tokens, or full cookie values into metadata.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/database.types';

export type AuthActivityAction =
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_reset_requested'
  | 'auth.password_changed'
  | 'auth.access_denied'
  | 'auth.suspended_access_attempt'
  | 'auth.non_member_access_attempt';

type ActivityClient = SupabaseClient<Database>;

/**
 * Best-effort audit write. Failures must never break the auth flow.
 * Prefer the user-scoped client when the actor has a Studio profile;
 * use the service client only for pre-membership failure events.
 */
export async function recordAuthActivity(
  client: ActivityClient,
  input: {
    actorProfileId?: string | null;
    action: AuthActivityAction;
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
      action: input.action,
      subject_type: input.subjectType ?? 'auth',
      subject_id: input.subjectId ?? null,
      metadata,
    });
  } catch {
    // Swallow — audit must not break auth UX.
  }
}

/** Safe metadata keys only — never include secrets. */
export function sanitizeAuthMetadata(input: {
  reason?: string;
  emailDomain?: string | null;
}): Record<string, Json> {
  const out: Record<string, Json> = {};
  if (input.reason) out.reason = input.reason;
  if (input.emailDomain) out.email_domain = input.emailDomain;
  return out;
}

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}
