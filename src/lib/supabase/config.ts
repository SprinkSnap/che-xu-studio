import { z } from 'zod';
import {
  getStudioAuthCookieOptions,
  getSupabasePublicConfig,
  isSupabasePublicConfigured,
  resolveSupabasePublicEnv,
  type SupabasePublicConfig,
  type SupabasePublicEnvSource,
} from './public-config';

/**
 * Supabase env for Studio OS (server modules).
 * Client code must import from `./public-config` only — never this file —
 * so the secret env name is not emitted into browser bundles.
 */
export type SupabaseEnvSource = SupabasePublicEnvSource & {
  SUPABASE_SECRET_KEY?: string | null;
};

export type { SupabasePublicConfig, SupabasePublicEnvSource };
export {
  getStudioAuthCookieOptions,
  getSupabasePublicConfig,
  isSupabasePublicConfigured,
  resolveSupabasePublicEnv,
};

const secretConfigSchema = z.object({
  secretKey: z.string().min(20, 'Server Supabase secret key is missing or too short'),
});

export type SupabaseSecretConfig = z.infer<typeof secretConfigSchema>;

function trimOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resolve env from an explicit source (Worker bindings / tests) with import.meta / process fallbacks.
 * Never logs secret values. Server-only — do not import from client components.
 */
export function resolveSupabaseEnv(source?: SupabaseEnvSource): SupabaseEnvSource {
  const publicEnv = resolveSupabasePublicEnv(source);
  const fromProcess =
    typeof process !== 'undefined'
      ? {
          SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
        }
      : {};

  return {
    ...publicEnv,
    SUPABASE_SECRET_KEY:
      source?.SUPABASE_SECRET_KEY ??
      (typeof import.meta.env.SUPABASE_SECRET_KEY === 'string'
        ? import.meta.env.SUPABASE_SECRET_KEY
        : undefined) ??
      fromProcess.SUPABASE_SECRET_KEY,
  };
}

export function isSupabaseSecretConfigured(source?: SupabaseEnvSource): boolean {
  const env = resolveSupabaseEnv(source);
  return trimOrEmpty(env.SUPABASE_SECRET_KEY).length > 0;
}

export function getSupabaseSecretConfig(source?: SupabaseEnvSource): SupabaseSecretConfig {
  const env = resolveSupabaseEnv(source);
  const parsed = secretConfigSchema.safeParse({
    secretKey: trimOrEmpty(env.SUPABASE_SECRET_KEY),
  });
  if (!parsed.success) {
    throw new Error(
      'Supabase secret configuration is incomplete. Set the server-only Supabase secret key.',
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
