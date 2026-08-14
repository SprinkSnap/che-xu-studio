/**
 * Studio membership resolution (profiles table).
 * Auth user ≠ Studio member — profile + active status required.
 */

import type { User } from '@supabase/supabase-js';
import type { StudioSupabaseClient } from '../supabase/types';
import {
  toStudioAuthContext,
  type StudioAuthContext,
  type StudioProfileSummary,
} from './studio-context';

export async function getAuthUser(
  supabase: StudioSupabaseClient,
): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Load the Studio profile for the authenticated auth user via RLS.
 * Returns null when no matching profile exists (non-member).
 */
export async function getStudioProfile(
  supabase: StudioSupabaseClient,
  authUserId: string,
): Promise<StudioProfileSummary | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, auth_user_id, role, status, display_name, email')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    authUserId: data.auth_user_id,
    role: data.role,
    status: data.status,
    displayName: data.display_name,
    email: data.email,
  };
}

/**
 * Resolve full Studio auth context for the current request.
 * Returns null when unauthenticated or no Studio profile.
 */
export async function getStudioAuthContext(
  supabase: StudioSupabaseClient,
): Promise<StudioAuthContext | null> {
  const user = await getAuthUser(supabase);
  if (!user) return null;

  const profile = await getStudioProfile(supabase, user.id);
  if (!profile) return null;

  return toStudioAuthContext(user, profile);
}

export type ResolveStudioAccessResult =
  | { kind: 'anonymous' }
  | { kind: 'authenticated_non_member'; user: User }
  | { kind: 'suspended'; user: User; profile: StudioProfileSummary }
  | { kind: 'authorized'; context: StudioAuthContext };

/**
 * Classify the current request for middleware / route guards.
 */
export async function resolveStudioAccess(
  supabase: StudioSupabaseClient,
): Promise<ResolveStudioAccessResult> {
  const user = await getAuthUser(supabase);
  if (!user) return { kind: 'anonymous' };

  const profile = await getStudioProfile(supabase, user.id);
  if (!profile) return { kind: 'authenticated_non_member', user };

  if (profile.status !== 'active') {
    return { kind: 'suspended', user, profile };
  }

  return {
    kind: 'authorized',
    context: toStudioAuthContext(user, profile),
  };
}
