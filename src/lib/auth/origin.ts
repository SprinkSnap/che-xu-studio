/**
 * Same-origin / CSRF helpers for auth mutations (POST login, logout, reset).
 */

/**
 * Validate that a mutating request originates from our own site.
 * Allows missing Origin (some same-site navigations) when Referer matches.
 */
export function isSameOriginMutation(request: Request, siteOrigin: string): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    return originsEqual(origin, siteOrigin);
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return originsEqual(refOrigin, siteOrigin);
    } catch {
      return false;
    }
  }

  // No Origin/Referer — reject cross-site POSTs that strip both (unusual).
  // Allow in non-production for local tooling that omits headers.
  return import.meta.env.DEV === true;
}

function originsEqual(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

export function requestSiteOrigin(request: Request, fallback?: string | URL): string {
  const url = new URL(request.url);
  if (fallback) {
    try {
      return new URL(fallback).origin;
    } catch {
      /* use request */
    }
  }
  return url.origin;
}
