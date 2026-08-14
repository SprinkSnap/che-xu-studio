import type { APIRoute } from 'astro';
import { isSameOriginMutation, requestSiteOrigin } from '../../lib/auth/origin';
import { recordAuthActivity, sanitizeAuthMetadata } from '../../lib/auth/activity';
import { logStudioAuthEvent, signOut } from '../../lib/supabase/auth';
import { STUDIO_CACHE_CONTROL, STUDIO_ROBOTS_HEADER } from '../../lib/studio/private-paths';

export const prerender = false;

/**
 * CSRF-safe logout. Prefer POST — GET redirects to login without side effects.
 */
export const GET: APIRoute = async () => {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/login',
      'Cache-Control': STUDIO_CACHE_CONTROL,
      'X-Robots-Tag': STUDIO_ROBOTS_HEADER,
    },
  });
};

export const POST: APIRoute = async (context) => {
  const origin = requestSiteOrigin(context.request, context.url);
  if (!isSameOriginMutation(context.request, origin)) {
    return new Response('Invalid request origin.', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': STUDIO_CACHE_CONTROL,
        'X-Robots-Tag': STUDIO_ROBOTS_HEADER,
      },
    });
  }

  const supabase = context.locals.studioSupabase;
  const profileId = context.locals.studioAuth?.profile.id ?? null;

  if (supabase) {
    if (profileId) {
      await recordAuthActivity(supabase, {
        actorProfileId: profileId,
        action: 'auth.logout',
        metadata: sanitizeAuthMetadata({ reason: 'user_initiated' }),
      });
    }
    try {
      await signOut(supabase);
    } catch (error) {
      logStudioAuthEvent('logout_error', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: '/admin/login',
      'Cache-Control': STUDIO_CACHE_CONTROL,
      'X-Robots-Tag': STUDIO_ROBOTS_HEADER,
    },
  });
};
