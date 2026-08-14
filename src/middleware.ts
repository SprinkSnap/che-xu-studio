import { defineMiddleware } from 'astro:middleware';
import { securityHeaders } from './lib/security';
import {
  isStudioOsEnabled,
  isStudioPrivatePath,
  STUDIO_CACHE_CONTROL,
  STUDIO_ROBOTS_HEADER,
} from './lib/studio/private-paths';

/**
 * Resolve Studio enablement without touching Astro.locals.runtime.env
 * (removed in Astro 6+; accessing it throws). Prefer process/.dev.vars via
 * dynamic cloudflare:workers import only on private Studio paths so Node
 * prerender of marketing pages never loads that module.
 */
async function readStudioOsEnabledFlag(): Promise<string | boolean | null | undefined> {
  if (typeof process !== 'undefined' && process.env?.STUDIO_OS_ENABLED != null) {
    return process.env.STUDIO_OS_ENABLED;
  }
  const fromImportMeta = import.meta.env.STUDIO_OS_ENABLED;
  if (typeof fromImportMeta === 'string') return fromImportMeta;

  try {
    const worker = await import('cloudflare:workers');
    return worker.env.STUDIO_OS_ENABLED;
  } catch {
    return undefined;
  }
}

/**
 * Phase 5 will insert RequireStudioAdmin after private-path detection.
 * Phase 2 only enforces robots/cache isolation and an enablement gate
 * (no fake passwords or query-string bypasses).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const privateStudio = isStudioPrivatePath(path);

  if (privateStudio) {
    const enabled = isStudioOsEnabled({
      isDev: import.meta.env.DEV,
      studioOsEnabled: await readStudioOsEnabledFlag(),
    });

    if (!enabled) {
      return new Response('Studio OS is not enabled in this environment.', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': STUDIO_CACHE_CONTROL,
          'X-Robots-Tag': STUDIO_ROBOTS_HEADER,
        },
      });
    }
  }

  const response = await next();
  const isProduction = import.meta.env.PROD;
  const headers = securityHeaders(isProduction);

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  // APIs and portfolio Work stay uncached so CTA/link updates are visible immediately.
  // Other marketing pages may cache briefly at the edge (short SWR — not multi-hour).
  // Studio private HTML must never be shared-cached.
  const isWork = path === '/work' || path.startsWith('/work/');
  if (privateStudio) {
    response.headers.set('Cache-Control', STUDIO_CACHE_CONTROL);
    response.headers.set('X-Robots-Tag', STUDIO_ROBOTS_HEADER);
  } else if (path.startsWith('/api/') || isWork) {
    response.headers.set('Cache-Control', 'no-store');
  } else if (response.headers.get('Cache-Control') == null && response.status === 200) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=60, stale-while-revalidate=30',
    );
  }

  return response;
});
