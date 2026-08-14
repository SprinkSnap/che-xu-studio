/**
 * Studio base URL helpers for password-reset redirects and absolute links.
 */

export function resolveStudioBaseUrl(source?: {
  STUDIO_BASE_URL?: string | null;
  PUBLIC_SITE_URL?: string | null;
  requestUrl?: string | URL;
}): string {
  const fromEnv =
    (typeof source?.STUDIO_BASE_URL === 'string' && source.STUDIO_BASE_URL.trim()) ||
    (typeof process !== 'undefined' ? process.env.STUDIO_BASE_URL?.trim() : '') ||
    (typeof import.meta.env.STUDIO_BASE_URL === 'string'
      ? import.meta.env.STUDIO_BASE_URL.trim()
      : '');

  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* fall through */
    }
  }

  if (source?.requestUrl) {
    try {
      return new URL(source.requestUrl).origin;
    } catch {
      /* fall through */
    }
  }

  // Local default — production should set STUDIO_BASE_URL=https://studio.chexustudio.com
  return 'http://localhost:4321';
}

/** Password recovery redirect target (internal Astro path under /admin). */
export function studioResetPasswordUrl(baseUrl: string): string {
  return new URL('/admin/reset-password', baseUrl).toString();
}
