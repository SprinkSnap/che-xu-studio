/**
 * Same-origin / CSRF helpers for mutating form POSTs.
 *
 * Astro's built-in security.checkOrigin only compares Origin === url.origin and
 * rejects when Origin is absent. Some in-app browsers (notably Outlook/Hotmail
 * WebViews) omit Origin on form POST. We keep a stricter app-level check that
 * also accepts Referer and Sec-Fetch-Site: same-origin.
 */

/**
 * Validate that a mutating request originates from our own site.
 * Allows missing Origin when Referer matches, or Sec-Fetch-Site is same-origin.
 */
export function isSameOriginMutation(request: Request, siteOrigin: string): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    // Opaque origins are not treated as first-party for Studio mutations.
    if (origin === 'null') return false;
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

  // Outlook / some WebViews strip Origin+Referer but still send Fetch Metadata.
  const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'same-origin') {
    return true;
  }

  // No Origin/Referer/Fetch-Metadata — reject cross-site POSTs that strip all
  // signals. Allow in non-production for local tooling that omits headers.
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
