/**
 * Studio auth context — membership + permission assertions.
 * Authorization decisions belong on the server, never in UI alone.
 */

import type { Tables } from '../supabase/database.types';
import type { StudioAuthUser } from '../supabase/types';
import { StudioAuthError } from '../supabase/types';
import type { StudioPermission, StudioRole, StudioUserStatus } from './permissions';
import { isActiveStudioStatus, roleHasPermission } from './permissions';

export type StudioProfile = Pick<
  Tables<'profiles'>,
  'id' | 'auth_user_id' | 'display_name' | 'email' | 'role' | 'status'
>;

export type StudioProfileSummary = {
  id: string;
  authUserId: string;
  role: StudioRole;
  status: StudioUserStatus;
  displayName: string | null;
  email: string;
};

export type StudioAuthContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: {
    id: string;
    role: StudioRole;
    status: StudioUserStatus;
    displayName: string | null;
    email: string;
  };
};

export function profileRowToSummary(profile: StudioProfile): StudioProfileSummary {
  return {
    id: profile.id,
    authUserId: profile.auth_user_id,
    role: profile.role,
    status: profile.status,
    displayName: profile.display_name,
    email: profile.email,
  };
}

export function toStudioAuthContext(
  user: Pick<StudioAuthUser, 'id' | 'email'>,
  profile: StudioProfileSummary | StudioProfile,
): StudioAuthContext {
  const summary =
    'authUserId' in profile && 'displayName' in profile
      ? (profile as StudioProfileSummary)
      : profileRowToSummary(profile as StudioProfile);

  return {
    user: {
      id: user.id,
      email: user.email ?? summary.email ?? null,
    },
    profile: {
      id: summary.id,
      role: summary.role,
      status: summary.status,
      displayName: summary.displayName,
      email: summary.email,
    },
  };
}

export function assertActiveStudioMembership(
  profile: StudioProfileSummary | StudioProfile | null,
): StudioProfileSummary {
  if (!profile) {
    throw new StudioAuthError('forbidden', 'Studio membership required.');
  }
  const summary =
    'authUserId' in profile && 'displayName' in profile
      ? (profile as StudioProfileSummary)
      : profileRowToSummary(profile as StudioProfile);

  if (!isActiveStudioStatus(summary.status)) {
    throw new StudioAuthError('suspended', 'Studio account is suspended.');
  }
  return summary;
}

export function assertStudioPermission(
  context: StudioAuthContext,
  permission: StudioPermission,
): void {
  if (!roleHasPermission(context.profile.role, permission)) {
    throw new StudioAuthError('forbidden', 'Permission denied.');
  }
}

export function assertStudioRole(
  context: StudioAuthContext,
  roles: readonly StudioRole[],
): void {
  if (!roles.includes(context.profile.role)) {
    throw new StudioAuthError('forbidden', 'Permission denied.');
  }
}

export type { StudioRole, StudioUserStatus, StudioPermission };
