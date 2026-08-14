import type { StudioActor } from '../auth/types';
import { redactForLogs } from '../security';
import type { StudioSupabaseClient } from './types';
import { StudioAuthError, type StudioAuthState, type StudioAuthUser } from './types';

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

function toStudioActor(user: StudioAuthUser): StudioActor {
  return {
    id: user.id,
    email: user.email ?? '',
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
  // Session is informational; authorization uses getUser above.
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
 * Phase 5 will check profiles/membership after Phase 4 schema exists.
 * Scaffold only — does not hardcode admin emails or invent membership.
 */
export async function requireStudioAdmin(client: StudioSupabaseClient): Promise<StudioActor> {
  const user = await requireAuthenticatedUser(client);
  // Keep actor shape ready for Phase 5 membership checks.
  void toStudioActor(user);
  throw new StudioAuthError(
    'forbidden',
    'Studio admin authorization is not implemented until Phase 5 (after membership schema).',
  );
}

export async function signOut(client: StudioSupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) {
    logStudioAuthEvent('signOut_error', { message: error.message });
    throw new StudioAuthError('misconfigured', 'Unable to sign out.');
  }
}
