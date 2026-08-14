import { defineMiddleware } from 'astro:middleware';
import { securityHeaders } from './lib/security';
import {
  isStudioOsEnabled,
  isStudioPrivatePath,
  STUDIO_CACHE_CONTROL,
  STUDIO_ROBOTS_HEADER,
} from './lib/studio/private-paths';
import { isSupabasePublicConfigured, resolveSupabaseEnv } from './lib/supabase/config';
import { tryCreateSupabaseUserClient } from './lib/supabase/server';

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

async function readSupabaseEnvFromRuntime(): Promise<ReturnType<typeof resolveSupabaseEnv>> {
  let fromWorker: {
    PUBLIC_SUPABASE_URL?: string;
    PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
  } = {};
  try {
    const worker = await import('cloudflare:workers');
    fromWorker = {
      PUBLIC_SUPABASE_URL: worker.env.PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: worker.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: worker.env.SUPABASE_SECRET_KEY,
    };
  } catch {
    // Node prerender / non-worker tooling
  }
  return resolveSupabaseEnv(fromWorker);
}

/**
 * Studio route lifecycle (Phase 3 groundwork; Phase 5 adds authorization):
 * 1. Identify Studio private path
 * 2. Enforce STUDIO_OS_ENABLED gate
 * 3. Attach request-scoped Supabase user client when configured (no fake users)
 * 4. Phase 5: requireStudioAdmin / redirect to login
 * 5. Continue to route + security/cache headers
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const privateStudio = isStudioPrivatePath(path);

  context.locals.studioSupabase = null;
  context.locals.studioUser = null;

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

    const supabaseEnv = await readSupabaseEnvFromRuntime();
    if (isSupabasePublicConfigured(supabaseEnv)) {
      context.locals.studioSupabase = tryCreateSupabaseUserClient({
        request: context.request,
        cookies: context.cookies,
        env: supabaseEnv,
        isProduction: import.meta.env.PROD,
      });
    }

    // Phase 5 insertion point:
    // const user = await requireStudioAdmin(context.locals.studioSupabase);
    // context.locals.studioUser = user;
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
  const isStudioApi = path.startsWith('/api/studio/');
  if (privateStudio || isStudioApi) {
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
