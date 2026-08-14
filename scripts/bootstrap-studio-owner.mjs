#!/usr/bin/env node
/**
 * One-time / explicit Studio owner bootstrap (Phase 5).
 *
 * Creates (or links) an Auth user and an owner profile using the Supabase secret key.
 * Requires an explicit bootstrap secret so this cannot be invoked publicly.
 *
 * Usage:
 *   STUDIO_BOOTSTRAP_SECRET=... \
 *   PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SECRET_KEY=... \
 *   BOOTSTRAP_OWNER_EMAIL=owner@example.com \
 *   BOOTSTRAP_OWNER_PASSWORD='long-passphrase' \
 *   BOOTSTRAP_OWNER_DISPLAY_NAME='Owner' \
 *   node scripts/bootstrap-studio-owner.mjs
 *
 * Never hardcode emails/passwords in the repository.
 * Prefer creating the Auth user in the Supabase dashboard, then inserting the
 * matching profiles row via SQL with the service role — this script is optional.
 */
import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[bootstrap-studio-owner] Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

function main() {
  const expectedSecret = required('STUDIO_BOOTSTRAP_SECRET');
  const provided = process.env.STUDIO_BOOTSTRAP_CONFIRM?.trim();
  if (provided !== expectedSecret) {
    console.error(
      '[bootstrap-studio-owner] Refusing to run. Set STUDIO_BOOTSTRAP_CONFIRM to the same value as STUDIO_BOOTSTRAP_SECRET.',
    );
    process.exit(1);
  }

  const url = required('PUBLIC_SUPABASE_URL');
  const secretKey = required('SUPABASE_SECRET_KEY');
  const email = required('BOOTSTRAP_OWNER_EMAIL').toLowerCase();
  const password = required('BOOTSTRAP_OWNER_PASSWORD');
  const displayName = process.env.BOOTSTRAP_OWNER_DISPLAY_NAME?.trim() || 'Owner';

  if (password.length < 12) {
    console.error('[bootstrap-studio-owner] BOOTSTRAP_OWNER_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  (async () => {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId = created?.user?.id;
    if (createError) {
      // If the user already exists, look them up — do not invent access.
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = listed.data?.users?.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!existing) {
        console.error('[bootstrap-studio-owner] Unable to create or find auth user.');
        console.error(createError.message);
        process.exit(1);
      }
      userId = existing.id;
      console.log('[bootstrap-studio-owner] Auth user already exists; linking profile.');
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          auth_user_id: userId,
          email,
          role: 'owner',
          status: 'active',
          display_name: displayName,
        },
        { onConflict: 'auth_user_id' },
      )
      .select('id, role, status')
      .single();

    if (profileError) {
      console.error('[bootstrap-studio-owner] Profile upsert failed:', profileError.message);
      process.exit(1);
    }

    console.log('[bootstrap-studio-owner] Owner ready:', {
      profileId: profile.id,
      role: profile.role,
      status: profile.status,
    });
  })().catch((err) => {
    console.error('[bootstrap-studio-owner] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

main();
