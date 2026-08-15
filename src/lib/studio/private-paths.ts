/**
 * Path helpers for Studio OS private surfaces.
 * Used by middleware (cache + robots) and tests. Not a security boundary by itself.
 */

/** Admin UI, client capability docs, and authenticated Studio APIs. */
const PRIVATE_PREFIXES = ['/admin', '/proposal', '/invoice', '/api/studio'] as const;

export function normalizePathname(pathname: string): string {
  if (!pathname) return '/';
  try {
    // Accept full URLs defensively.
    if (pathname.includes('://')) {
      pathname = new URL(pathname).pathname;
    }
  } catch {
    // keep raw
  }
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function isStudioAdminPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === '/admin' || path.startsWith('/admin/');
}

export function isClientDocumentPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return (
    path === '/proposal' ||
    path.startsWith('/proposal/') ||
    path === '/invoice' ||
    path.startsWith('/invoice/')
  );
}

/** Admin + client-document routes that must never be indexed or edge-cached as shared HTML. */
export function isStudioPrivatePath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export const STUDIO_ROBOTS_HEADER = 'noindex, nofollow, noarchive';
export const STUDIO_CACHE_CONTROL = 'private, no-store';

/**
 * Studio OS is gated until Phase 5 auth + intentional production enablement.
 * Local `astro dev` always allows. Preview/production require STUDIO_OS_ENABLED=true.
 */
export function isStudioOsEnabled(options: {
  isDev: boolean;
  studioOsEnabled?: string | boolean | null;
}): boolean {
  if (options.isDev) return true;
  const raw = options.studioOsEnabled;
  if (raw === true || raw === 'true' || raw === '1') return true;
  return false;
}
