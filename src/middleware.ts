import { defineMiddleware } from 'astro:middleware';
import { securityHeaders } from './lib/security';
import {
  isStudioOsEnabled,
  isStudioPrivatePath,
  isClientDocumentPath,
  STUDIO_CACHE_CONTROL,
  STUDIO_ROBOTS_HEADER,
} from './lib/studio/private-paths';
import {
  isStudioProtectedAdminPath,
  isStudioPublicAuthPath,
} from './lib/auth/types';
import { loginUrl, safeStudioRedirect } from './lib/auth/redirects';
import { resolveStudioAccess } from './lib/auth/profile';
import { recordAuthActivity, sanitizeAuthMetadata, emailDomain } from './lib/auth/activity';
import { isSupabasePublicConfigured, resolveSupabaseEnv } from './lib/supabase/config';
import { tryCreateSupabaseUserClient } from './lib/supabase/server';
import { signOut, logStudioAuthEvent } from './lib/supabase/auth';

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

function privateStudioHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set('Cache-Control', STUDIO_CACHE_CONTROL);
  headers.set('X-Robots-Tag', STUDIO_ROBOTS_HEADER);
  return headers;
}

/**
 * Studio route lifecycle (Phase 5 + Phase 15):
 * 1. Identify Studio private path (/admin, /proposal, /invoice, /api/studio)
 * 2. Enforce STUDIO_OS_ENABLED gate
 * 3. Attach request-scoped Supabase user client when configured
 * 4. Resolve membership for /admin (skip expensive work for marketing)
 * 5. Protect /admin except public auth routes
 * 6. Continue to route + security/cache headers
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname;
  const privateStudio = isStudioPrivatePath(path);
  const protectedAdmin = isStudioProtectedAdminPath(path);
  const publicAuth = isStudioPublicAuthPath(path);

  context.locals.studioSupabase = null;
  context.locals.studioUser = null;
  context.locals.studioAuth = null;

  if (privateStudio) {
    const enabled = isStudioOsEnabled({
      isDev: import.meta.env.DEV,
      studioOsEnabled: await readStudioOsEnabledFlag(),
    });

    if (!enabled) {
      return new Response('Studio OS is not enabled in this environment.', {
        status: 404,
        headers: privateStudioHeaders({
          'Content-Type': 'text/plain; charset=utf-8',
        }),
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

    // Only resolve Studio auth for /admin surfaces (not every marketing asset,
    // and not client-document placeholders that use token auth later).
    if ((protectedAdmin || publicAuth) && context.locals.studioSupabase) {
      const access = await resolveStudioAccess(context.locals.studioSupabase);

      if (access.kind === 'authorized') {
        context.locals.studioAuth = access.context;
        context.locals.studioUser = {
          id: access.context.user.id,
          email: access.context.user.email ?? undefined,
          aud: 'authenticated',
          role: 'authenticated',
          created_at: '',
        };
      }

      if (protectedAdmin) {
        if (access.kind === 'anonymous') {
          const nextPath = `${context.url.pathname}${context.url.search}`;
          return context.redirect(loginUrl(nextPath), 302);
        }

        if (access.kind === 'authenticated_non_member') {
          logStudioAuthEvent('access_denied_non_member');
          await recordAuthActivity(context.locals.studioSupabase, {
            action: 'auth.non_member_access_attempt',
            metadata: sanitizeAuthMetadata({
              reason: 'non_member',
              emailDomain: emailDomain(access.user.email),
            }),
          });
          try {
            await signOut(context.locals.studioSupabase);
          } catch {
            /* continue to access-denied */
          }
          return context.redirect('/admin/access-denied', 302);
        }

        if (access.kind === 'suspended') {
          logStudioAuthEvent('access_denied_suspended');
          await recordAuthActivity(context.locals.studioSupabase, {
            actorProfileId: access.profile.id,
            action: 'auth.suspended_access_attempt',
            metadata: sanitizeAuthMetadata({ reason: 'suspended' }),
          });
          try {
            await signOut(context.locals.studioSupabase);
          } catch {
            /* continue */
          }
          return context.redirect('/admin/access-denied', 302);
        }
      }

      // Authorized users visiting login should go to Studio (or safe next).
      if (
        publicAuth &&
        path === '/admin/login' &&
        access.kind === 'authorized' &&
        context.request.method === 'GET'
      ) {
        const nextParam = context.url.searchParams.get('next');
        return context.redirect(safeStudioRedirect(nextParam), 302);
      }
    } else if (protectedAdmin && !context.locals.studioSupabase) {
      // Fail closed when Studio is enabled but Supabase is not configured.
      return context.redirect(loginUrl(`${context.url.pathname}${context.url.search}`), 302);
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

  // Capability document pages: never send full token URLs as referrers.
  if (isClientDocumentPath(path)) {
    response.headers.set('Referrer-Policy', 'no-referrer');
  }

  return response;
});
