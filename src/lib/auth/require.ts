/**
 * Centralized Studio authorization helpers for pages and API routes.
 */

import type { APIContext, AstroGlobal } from 'astro';
import type { StudioPermission } from './permissions';
import { isStudioAdminRole } from './permissions';
import {
  assertStudioPermission,
  assertStudioRole,
  type StudioAuthContext,
  type StudioRole,
} from './studio-context';
import { getStudioAuthContext } from './profile';
import { StudioAuthError } from '../supabase/types';
import type { StudioSupabaseClient } from '../supabase/types';

type AstroLike = Pick<AstroGlobal, 'locals' | 'redirect' | 'url'> | APIContext;

function getSupabase(astro: AstroLike): StudioSupabaseClient {
  const client = astro.locals.studioSupabase;
  if (!client) {
    throw new StudioAuthError(
      'misconfigured',
      'Supabase client is not available on this request.',
    );
  }
  return client;
}

/**
 * Require an authorized Studio member (active + permitted role).
 * Prefer middleware-populated locals.studioAuth when present.
 */
export async function requireStudioUser(
  astro: AstroLike,
): Promise<StudioAuthContext> {
  if (astro.locals.studioAuth) {
    return astro.locals.studioAuth;
  }

  const supabase = getSupabase(astro);
  const context = await getStudioAuthContext(supabase);
  if (!context) {
    throw new StudioAuthError('unauthenticated', 'Studio authentication required.');
  }
  if (context.profile.status !== 'active') {
    throw new StudioAuthError('suspended', 'Studio access is not available.');
  }
  return context;
}

export async function requireStudioRole(
  astro: AstroLike,
  roles: readonly StudioRole[],
): Promise<StudioAuthContext> {
  const context = await requireStudioUser(astro);
  assertStudioRole(context, roles);
  return context;
}

export async function requireStudioPermission(
  astro: AstroLike,
  permission: StudioPermission,
): Promise<StudioAuthContext> {
  const context = await requireStudioUser(astro);
  assertStudioPermission(context, permission);
  return context;
}

/** Owner/admin gate for high-risk administrative surfaces. */
export async function requireStudioAdminActor(
  astro: AstroLike,
): Promise<StudioAuthContext> {
  const context = await requireStudioUser(astro);
  if (!isStudioAdminRole(context.profile.role)) {
    throw new StudioAuthError('forbidden', 'Studio admin authorization required.');
  }
  return context;
}

/**
 * API helper: return a JSON 401/403 Response instead of throwing into HTML.
 */
export function studioAuthErrorResponse(error: unknown): Response | null {
  if (!(error instanceof StudioAuthError)) return null;
  return new Response(
    JSON.stringify({
      error:
        error.code === 'unauthenticated'
          ? 'Authentication required.'
          : error.code === 'misconfigured'
            ? 'Studio authentication is not configured.'
            : 'Access denied.',
      code: error.code,
    }),
    {
      status: error.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    },
  );
}
