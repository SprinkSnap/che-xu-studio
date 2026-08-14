import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import {
  getStudioAuthCookieOptions,
  getSupabasePublicConfig,
  getSupabaseSecretConfig,
  isSupabasePublicConfigured,
  isSupabaseSecretConfigured,
  type SupabaseEnvSource,
} from './config';
import type { Database } from './database.types';
import type { StudioSupabaseClient, StudioSupabaseServiceClient } from './types';

function assertServerOnly(moduleLabel: string): void {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    throw new Error(`${moduleLabel} is server-only and must not run in the browser.`);
  }
}

export type CreateUserClientOptions = {
  request: Request;
  cookies: AstroCookies;
  env?: SupabaseEnvSource;
  isProduction?: boolean;
};

/**
 * Request-scoped Supabase client acting as the authenticated user (publishable key + cookies).
 * Respects future RLS. Preferred path for Studio reads/writes.
 */
export function createSupabaseUserClient(options: CreateUserClientOptions): StudioSupabaseClient {
  assertServerOnly('createSupabaseUserClient');
  const { url, publishableKey } = getSupabasePublicConfig(options.env);
  const isProduction = options.isProduction ?? import.meta.env.PROD;
  const cookieOptions = getStudioAuthCookieOptions(isProduction);

  return createServerClient<Database>(url, publishableKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return parseCookieHeader(options.request.headers.get('Cookie') ?? '').map(
          ({ name, value }) => ({
            name,
            value: value ?? '',
          }),
        );
      },
      setAll(cookiesToSet) {
        for (const { name, value, options: setOptions } of cookiesToSet) {
          options.cookies.set(name, value, {
            ...cookieOptions,
            ...setOptions,
            // Keep host-only Studio scope — never widen to parent marketing domain.
            domain: undefined,
          });
        }
      },
    },
  });
}

export function tryCreateSupabaseUserClient(
  options: CreateUserClientOptions,
): StudioSupabaseClient | null {
  if (!isSupabasePublicConfigured(options.env)) return null;
  return createSupabaseUserClient(options);
}

/**
 * Privileged service client (SUPABASE_SECRET_KEY).
 * Reserved for webhooks, automation, and carefully scoped system tasks.
 * Never the default query path — prefer user client + RLS.
 */
export function createSupabaseServiceClient(
  env?: SupabaseEnvSource,
): StudioSupabaseServiceClient {
  assertServerOnly('createSupabaseServiceClient');
  const { url } = getSupabasePublicConfig(env);
  const { secretKey } = getSupabaseSecretConfig(env);

  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function tryCreateSupabaseServiceClient(
  env?: SupabaseEnvSource,
): StudioSupabaseServiceClient | null {
  if (!isSupabasePublicConfigured(env) || !isSupabaseSecretConfigured(env)) return null;
  return createSupabaseServiceClient(env);
}
