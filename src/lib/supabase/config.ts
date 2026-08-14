import { z } from 'zod';

/**
 * Supabase env for Studio OS.
 * PUBLIC_* values may ship to the browser. SUPABASE_SECRET_KEY must stay server-only.
 */
export type SupabaseEnvSource = {
  PUBLIC_SUPABASE_URL?: string | null;
  PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | null;
  SUPABASE_SECRET_KEY?: string | null;
};

const publicConfigSchema = z.object({
  url: z.httpUrl({ error: 'PUBLIC_SUPABASE_URL must be a valid URL' }),
  publishableKey: z.string().min(20, 'PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or too short'),
});

const secretConfigSchema = z.object({
  secretKey: z.string().min(20, 'SUPABASE_SECRET_KEY is missing or too short'),
});

export type SupabasePublicConfig = z.infer<typeof publicConfigSchema>;
export type SupabaseSecretConfig = z.infer<typeof secretConfigSchema>;

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve env from an explicit source (Worker bindings / tests) with import.meta / process fallbacks.
 * Never logs secret values.
 */
export function resolveSupabaseEnv(source?: SupabaseEnvSource): SupabaseEnvSource {
  const fromProcess =
    typeof process !== 'undefined'
      ? {
          PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
          PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
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
    SUPABASE_SECRET_KEY:
      source?.SUPABASE_SECRET_KEY ??
      // Never exposed via PUBLIC_ — only server env / Worker secrets.
      (typeof import.meta.env.SUPABASE_SECRET_KEY === 'string'
        ? import.meta.env.SUPABASE_SECRET_KEY
        : undefined) ??
      fromProcess.SUPABASE_SECRET_KEY,
  };
}

export function isSupabasePublicConfigured(source?: SupabaseEnvSource): boolean {
  const env = resolveSupabaseEnv(source);
  return (
    trimOrEmpty(env.PUBLIC_SUPABASE_URL).length > 0 &&
    trimOrEmpty(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY).length > 0
  );
}

export function isSupabaseSecretConfigured(source?: SupabaseEnvSource): boolean {
  const env = resolveSupabaseEnv(source);
  return trimOrEmpty(env.SUPABASE_SECRET_KEY).length > 0;
}

export function getSupabasePublicConfig(source?: SupabaseEnvSource): SupabasePublicConfig {
  const env = resolveSupabaseEnv(source);
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

export function getSupabaseSecretConfig(source?: SupabaseEnvSource): SupabaseSecretConfig {
  const env = resolveSupabaseEnv(source);
  const parsed = secretConfigSchema.safeParse({
    secretKey: trimOrEmpty(env.SUPABASE_SECRET_KEY),
  });
  if (!parsed.success) {
    throw new Error(
      'Supabase secret configuration is incomplete. Set SUPABASE_SECRET_KEY on the server only.',
    );
  }
  return parsed.data;
}

/** Safe summary for health endpoints — never includes key material. */
export function getSupabaseConfigStatus(source?: SupabaseEnvSource): {
  publicConfigured: boolean;
  secretConfigured: boolean;
} {
  return {
    publicConfigured: isSupabasePublicConfigured(source),
    secretConfigured: isSupabaseSecretConfigured(source),
  };
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
