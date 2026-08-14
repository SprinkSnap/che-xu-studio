import { normalizePathname } from '../studio/private-paths';

const DEFAULT_REDIRECT = '/admin';

/**
 * Allow only internal Studio paths for post-login redirects.
 * Rejects protocol-relative, absolute, and javascript: URLs.
 */
export function safeStudioRedirect(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT;
  const value = raw.trim();
  if (!value.startsWith('/')) return DEFAULT_REDIRECT;
  if (value.startsWith('//')) return DEFAULT_REDIRECT;
  if (value.includes('://')) return DEFAULT_REDIRECT;
  if (/[\x00-\x1f]/.test(value)) return DEFAULT_REDIRECT;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return DEFAULT_REDIRECT;

  let path = value;
  try {
    const url = new URL(value, 'https://studio.invalid');
    path = url.pathname + (url.search || '');
  } catch {
    return DEFAULT_REDIRECT;
  }

  const normalized = normalizePathname(path.split('?')[0] || '/');
  if (normalized !== '/admin' && !normalized.startsWith('/admin/')) {
    return DEFAULT_REDIRECT;
  }

  // Never bounce back to auth pages via next=
  if (
    normalized === '/admin/login' ||
    normalized === '/admin/forgot-password' ||
    normalized === '/admin/reset-password' ||
    normalized === '/admin/logout' ||
    normalized === '/admin/access-denied'
  ) {
    return DEFAULT_REDIRECT;
  }

  return path.startsWith('/admin') ? path : DEFAULT_REDIRECT;
}

export function loginUrl(next?: string | null): string {
  const safe = next ? safeStudioRedirect(next) : DEFAULT_REDIRECT;
  if (safe === DEFAULT_REDIRECT) return '/admin/login';
  return `/admin/login?next=${encodeURIComponent(safe)}`;
}
