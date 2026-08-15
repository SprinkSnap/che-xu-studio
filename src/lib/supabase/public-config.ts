import { z } from 'zod';

/**
 * Browser-safe Supabase public env.
 * Never reference SUPABASE_SECRET_KEY in this module — it is imported by client components.
 */

export type SupabasePublicEnvSource = {
  PUBLIC_SUPABASE_URL?: string | null;
  PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | null;
};

const publicConfigSchema = z.object({
  url: z.httpUrl({ error: 'PUBLIC_SUPABASE_URL must be a valid URL' }),
  publishableKey: z.string().min(20, 'PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or too short'),
});

export type SupabasePublicConfig = z.infer<typeof publicConfigSchema>;

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveSupabasePublicEnv(source?: SupabasePublicEnvSource): SupabasePublicEnvSource {
  const fromProcess =
    typeof process !== 'undefined'
      ? {
          PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
          PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        }
      : {};

  return {
    PUBLIC_SUPABASE_URL:
      source?.PUBLIC_SUPABASE_URL ??
      import.meta.env.PUBLIC_SUPABASE_URL ??
      fromProcess.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      source?.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      fromProcess.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function isSupabasePublicConfigured(source?: SupabasePublicEnvSource): boolean {
  const env = resolveSupabasePublicEnv(source);
  return (
    trimOrEmpty(env.PUBLIC_SUPABASE_URL).length > 0 &&
    trimOrEmpty(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY).length > 0
  );
}

export function getSupabasePublicConfig(source?: SupabasePublicEnvSource): SupabasePublicConfig {
  const env = resolveSupabasePublicEnv(source);
  const parsed = publicConfigSchema.safeParse({
    url: trimOrEmpty(env.PUBLIC_SUPABASE_URL),
    publishableKey: trimOrEmpty(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  });
  if (!parsed.success) {
    throw new Error(
      'Supabase public configuration is incomplete. Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return parsed.data;
}

/**
 * Cookie options for Studio-scoped auth (host-only).
 * Omit `domain` so cookies stay on studio.chexustudio.com / localhost and are
 * not sent to the marketing apex. @supabase/ssr uses readable cookies so the
 * browser client can sync session state (not HttpOnly-only).
 */
export function getStudioAuthCookieOptions(isProduction: boolean): {
  path: string;
  sameSite: 'lax';
  secure: boolean;
} {
  return {
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
  };
}
