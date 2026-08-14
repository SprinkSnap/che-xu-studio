/**
 * Authentication contracts for Studio OS (Phase 5).
 *
 * Phase 2 intentionally does NOT implement authentication.
 * Do not add fake passwords, hardcoded isAdmin flags, or query-string bypasses.
 * Production must keep Studio gated via STUDIO_OS_ENABLED until Phase 5 lands.
 */

export type StudioActor = {
  id: string;
  email: string;
};

/**
 * Future server-side session resolver. Phase 5 will implement against Supabase Auth.
 * Call sites should treat a null actor as unauthenticated.
 */
export type ResolveStudioActor = (request: Request) => Promise<StudioActor | null>;

/**
 * Future authorization gate for /admin mutations and SSR.
 * Phase 5 inserts this into middleware after private-path detection.
 */
export type RequireStudioAdmin = (request: Request) => Promise<StudioActor>;
