import { createBrowserClient } from '@supabase/ssr';
import {
  getStudioAuthCookieOptions,
  getSupabasePublicConfig,
  isSupabasePublicConfigured,
  type SupabasePublicEnvSource,
} from './public-config';
import type { Database } from './database.types';
import type { StudioSupabaseClient } from './types';

/**
 * Browser Supabase client — PUBLIC credentials only.
 * Import `./public-config` only (never `./config` or `./server`) so secret
 * env identifiers stay out of client bundles.
 */
export function createSupabaseBrowserClient(source?: SupabasePublicEnvSource): StudioSupabaseClient {
  if (typeof document === 'undefined') {
    throw new Error('createSupabaseBrowserClient must only run in the browser.');
  }

  const { url, publishableKey } = getSupabasePublicConfig(source);
  const isProduction = import.meta.env.PROD;

  return createBrowserClient<Database>(url, publishableKey, {
    cookieOptions: getStudioAuthCookieOptions(isProduction),
  });
}

export function tryCreateSupabaseBrowserClient(
  source?: SupabasePublicEnvSource,
): StudioSupabaseClient | null {
  if (!isSupabasePublicConfigured(source)) return null;
  return createSupabaseBrowserClient(source);
}
