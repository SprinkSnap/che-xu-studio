import type { APIRoute } from 'astro';
import { jsonOk, jsonError } from '../../../lib/security';
import { getSupabaseConfigStatus, resolveSupabaseEnv } from '../../../lib/supabase/config';
import { isStudioOsEnabled } from '../../../lib/studio/private-paths';

export const prerender = false;

/**
 * Studio connectivity probe — no secrets, keys, or connection strings.
 * Disabled in production unless STUDIO_OS_ENABLED=true (same gate as /admin).
 */
export const GET: APIRoute = async () => {
  const enabled = isStudioOsEnabled({
    isDev: import.meta.env.DEV,
    studioOsEnabled:
      (typeof process !== 'undefined' ? process.env.STUDIO_OS_ENABLED : undefined) ??
      import.meta.env.STUDIO_OS_ENABLED,
  });

  if (!enabled) {
    return jsonError('Not found', 404);
  }

  const status = getSupabaseConfigStatus(resolveSupabaseEnv());

  return jsonOk(
    {
      ok: status.publicConfigured,
      services: {
        supabase: status.publicConfigured ? 'configured' : 'unconfigured',
      },
    },
    200,
    {
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  );
};
