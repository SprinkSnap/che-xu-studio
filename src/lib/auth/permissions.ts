import type { Enums } from '../supabase/database.types';

export type StudioRole = Enums<'studio_role'>;
export type StudioUserStatus = Enums<'studio_user_status'>;

/** Central Studio permission identifiers used by requireStudioPermission(). */
export type StudioPermission =
  | 'studio.dashboard.view'
  | 'studio.clients.read'
  | 'studio.clients.write'
  | 'studio.projects.read'
  | 'studio.projects.write'
  | 'studio.proposals.read'
  | 'studio.proposals.write'
  | 'studio.invoices.read'
  | 'studio.invoices.write'
  | 'studio.payments.read'
  | 'studio.templates.manage'
  | 'studio.settings.manage'
  | 'studio.users.manage';

const ALL_PERMISSIONS: readonly StudioPermission[] = [
  'studio.dashboard.view',
  'studio.clients.read',
  'studio.clients.write',
  'studio.projects.read',
  'studio.projects.write',
  'studio.proposals.read',
  'studio.proposals.write',
  'studio.invoices.read',
  'studio.invoices.write',
  'studio.payments.read',
  'studio.templates.manage',
  'studio.settings.manage',
  'studio.users.manage',
] as const;

/** Staff: operational read/write; no settings or user management. */
const STAFF_PERMISSIONS: readonly StudioPermission[] = [
  'studio.dashboard.view',
  'studio.clients.read',
  'studio.clients.write',
  'studio.projects.read',
  'studio.projects.write',
  'studio.proposals.read',
  'studio.proposals.write',
  'studio.invoices.read',
  'studio.invoices.write',
  'studio.payments.read',
  'studio.templates.manage',
] as const;

/**
 * Phase 5 role map — intentionally simple.
 * Owner and admin share full operational access; staff is a subset.
 * Later phases can narrow admin vs owner without scattering role checks.
 */
const ROLE_PERMISSIONS: Record<StudioRole, readonly StudioPermission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  staff: STAFF_PERMISSIONS,
};

export function permissionsForRole(role: StudioRole): readonly StudioPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: StudioRole, permission: StudioPermission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function isActiveStudioStatus(status: StudioUserStatus): boolean {
  return status === 'active';
}

export function isStudioAdminRole(role: StudioRole): boolean {
  return role === 'owner' || role === 'admin';
}
