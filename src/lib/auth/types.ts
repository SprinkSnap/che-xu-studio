/**
 * Authentication contracts and path helpers for Studio OS (Phase 5).
 */

import { normalizePathname } from '../studio/private-paths';

export type StudioActor = {
  id: string;
  email: string;
};

/**
 * Server-side session resolver. Null actor means unauthenticated.
 */
export type ResolveStudioActor = (request: Request) => Promise<StudioActor | null>;

/**
 * Authorization gate for /admin mutations and SSR.
 */
export type RequireStudioAdmin = (request: Request) => Promise<StudioActor>;

/** Auth UX routes that do not require an active Studio session. */
export function isStudioPublicAuthPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return (
    path === '/admin/login' ||
    path === '/admin/forgot-password' ||
    path === '/admin/reset-password' ||
    path === '/admin/access-denied' ||
    path === '/admin/logout'
  );
}

/** Protected Studio application routes under /admin. */
export function isStudioProtectedAdminPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path !== '/admin' && !path.startsWith('/admin/')) return false;
  return !isStudioPublicAuthPath(path);
}
