import { createBrowserClient } from '@supabase/ssr';
import {
  getStudioAuthCookieOptions,
  getSupabasePublicConfig,
  isSupabasePublicConfigured,
  type SupabaseEnvSource,
} from './config';
import type { Database } from './database.types';
import type { StudioSupabaseClient } from './types';

/**
 * Browser Supabase client — PUBLIC credentials only.
 * Never import `./server` from this module (keeps the secret key out of client bundles).
 */
export function createSupabaseBrowserClient(source?: SupabaseEnvSource): StudioSupabaseClient {
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
  source?: SupabaseEnvSource,
): StudioSupabaseClient | null {
  if (!isSupabasePublicConfigured(source)) return null;
  return createSupabaseBrowserClient(source);
}
