import type { StudioActor } from '../auth/types';
import { getStudioProfile } from '../auth/profile';
import { assertActiveStudioMembership, toStudioAuthContext } from '../auth/studio-context';
import { isStudioAdminRole } from '../auth/permissions';
import { redactForLogs } from '../security';
import type { StudioSupabaseClient } from './types';
import { StudioAuthError, type StudioAuthState, type StudioAuthUser } from './types';
import type { StudioAuthContext } from '../auth/studio-context';

export { StudioAuthError } from './types';

function toStudioAuthUser(user: {
  id: string;
  email?: string | null;
  aud: string;
  role?: string;
  created_at: string;
}): StudioAuthUser {
  return {
    id: user.id,
    email: user.email ?? undefined,
    aud: user.aud,
    role: user.role,
    created_at: user.created_at,
  };
}

function toStudioActor(user: StudioAuthUser, emailFallback?: string): StudioActor {
  return {
    id: user.id,
    email: user.email || emailFallback || '',
  };
}

/** Safe logging helper — never log tokens or full auth payloads. */
export function logStudioAuthEvent(event: string, details?: Record<string, unknown>): void {
  console.info('[studio-auth]', event, details ? redactForLogs(details) : undefined);
}

/**
 * Prefer getUser() over getSession() for authorization decisions (validates with Auth server).
 */
export async function getCurrentUser(
  client: StudioSupabaseClient,
): Promise<StudioAuthUser | null> {
  const { data, error } = await client.auth.getUser();
  if (error) {
    logStudioAuthEvent('getUser_error', { message: error.message });
    return null;
  }
  return data.user ? toStudioAuthUser(data.user) : null;
}

export async function getCurrentSession(
  client: StudioSupabaseClient,
): Promise<StudioAuthState['session']> {
  const { data, error } = await client.auth.getSession();
  if (error) {
    logStudioAuthEvent('getSession_error', { message: error.message });
    return null;
  }
  return data.session;
}

export async function getStudioAuthState(client: StudioSupabaseClient): Promise<StudioAuthState> {
  const user = await getCurrentUser(client);
  const session = user ? await getCurrentSession(client) : null;
  return { user, session };
}

export async function requireAuthenticatedUser(
  client: StudioSupabaseClient,
): Promise<StudioAuthUser> {
  const user = await getCurrentUser(client);
  if (!user) {
    throw new StudioAuthError('unauthenticated', 'Authentication required.');
  }
  return user;
}

/**
 * Require an active Studio member with owner/admin role.
 * Authentication alone is insufficient — matching profiles row required.
 */
export async function requireStudioAdmin(client: StudioSupabaseClient): Promise<StudioActor> {
  const user = await requireAuthenticatedUser(client);
  const profile = await getStudioProfile(client, user.id);
  const active = assertActiveStudioMembership(profile);
  if (!isStudioAdminRole(active.role)) {
    throw new StudioAuthError('forbidden', 'Studio admin authorization required.');
  }
  return toStudioActor(user, active.email);
}

/**
 * Require any active Studio member (owner, admin, or staff).
 */
export async function requireStudioMember(
  client: StudioSupabaseClient,
): Promise<StudioAuthContext> {
  const user = await requireAuthenticatedUser(client);
  const profile = await getStudioProfile(client, user.id);
  const active = assertActiveStudioMembership(profile);
  return toStudioAuthContext(user, active);
}

export async function signOut(client: StudioSupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    logStudioAuthEvent('signOut_error', { message: error.message });
    throw new StudioAuthError('misconfigured', 'Unable to sign out.');
  }
}
