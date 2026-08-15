/**
 * Resolve privileged Supabase service client for public capability flows only.
 */

import { resolveSupabaseEnv, isSupabaseSecretConfigured, isSupabasePublicConfigured } from '../supabase/config';
import { tryCreateSupabaseServiceClient } from '../supabase/server';
import type { StudioSupabaseServiceClient } from '../supabase/types';

export async function getPublicCapabilityServiceClient(): Promise<StudioSupabaseServiceClient | null> {
  let fromWorker: {
    PUBLIC_SUPABASE_URL?: string;
    PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
    SUPABASE_SECRET_KEY?: string;
  } = {};
  try {
    const worker = await import('cloudflare:workers');
    fromWorker = {
      PUBLIC_SUPABASE_URL: worker.env.PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: worker.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY: worker.env.SUPABASE_SECRET_KEY,
    };
  } catch {
    // Node / non-worker
  }
  const env = resolveSupabaseEnv(fromWorker);
  if (!isSupabasePublicConfigured(env) || !isSupabaseSecretConfigured(env)) {
    return null;
  }
  return tryCreateSupabaseServiceClient(env);
}
