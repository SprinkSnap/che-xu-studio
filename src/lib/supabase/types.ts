import type { Database } from './database.types';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

/** Request-scoped Studio Supabase user client (RLS-aware). */
export type StudioSupabaseClient = SupabaseClient<Database>;

/** Privileged server client — service/secret key. Use sparingly. */
export type StudioSupabaseServiceClient = SupabaseClient<Database>;

export type StudioAuthUser = Pick<User, 'id' | 'email' | 'aud' | 'role' | 'created_at'>;

export type StudioAuthState = {
  user: StudioAuthUser | null;
  session: Session | null;
};

export class StudioAuthError extends Error {
  readonly code: 'unauthenticated' | 'forbidden' | 'misconfigured' | 'suspended';
  readonly status: number;

  constructor(code: StudioAuthError['code'], message: string, status?: number) {
    super(message);
    this.name = 'StudioAuthError';
    this.code = code;
    this.status =
      status ??
      (code === 'unauthenticated' ? 401 : code === 'misconfigured' ? 500 : 403);
  }
}
