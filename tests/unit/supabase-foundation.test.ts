import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  getSupabaseConfigStatus,
  getSupabasePublicConfig,
  getSupabaseSecretConfig,
  getStudioAuthCookieOptions,
  isSupabasePublicConfigured,
  isSupabaseSecretConfigured,
  resolveSupabaseEnv,
} from '../../src/lib/supabase/config';
import {
  createSupabaseServiceClient,
  createSupabaseUserClient,
  tryCreateSupabaseServiceClient,
  tryCreateSupabaseUserClient,
} from '../../src/lib/supabase/server';
import { StudioAuthError, requireStudioAdmin } from '../../src/lib/supabase/auth';

const validPublic = {
  PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_1234567890',
};

const validSecret = {
  ...validPublic,
  SUPABASE_SECRET_KEY: 'sb_secret_phase3_canary_do_not_ship',
};

describe('supabase config validation', () => {
  it('detects missing public configuration', () => {
    expect(isSupabasePublicConfigured({})).toBe(false);
    expect(isSupabaseSecretConfigured({})).toBe(false);
    expect(() => getSupabasePublicConfig({})).toThrow(/public configuration/i);
    expect(() => getSupabaseSecretConfig({})).toThrow(/secret configuration/i);
  });

  it('accepts valid public and secret configuration', () => {
    expect(isSupabasePublicConfigured(validPublic)).toBe(true);
    expect(isSupabaseSecretConfigured(validSecret)).toBe(true);
    expect(getSupabasePublicConfig(validPublic)).toEqual({
      url: validPublic.PUBLIC_SUPABASE_URL,
      publishableKey: validPublic.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(getSupabaseSecretConfig(validSecret).secretKey).toBe(validSecret.SUPABASE_SECRET_KEY);
  });

  it('returns safe health status without key material', () => {
    const status = getSupabaseConfigStatus(validSecret);
    expect(status).toEqual({ publicConfigured: true, secretConfigured: true });
    expect(JSON.stringify(status)).not.toContain('sb_secret');
    expect(JSON.stringify(resolveSupabaseEnv(validSecret))).toContain('SUPABASE_SECRET_KEY');
  });

  it('uses host-only secure cookie options in production', () => {
    const options = getStudioAuthCookieOptions(true);
    expect(options).toEqual({ path: '/', sameSite: 'lax', secure: true });
    expect(options).not.toHaveProperty('domain');
  });
});

describe('supabase server clients', () => {
  it('creates a user client with cookies and publishable credentials only', () => {
    const cookies = {
      set: vi.fn(),
    };
    const client = createSupabaseUserClient({
      request: new Request('https://studio.chexustudio.com/admin', {
        headers: { Cookie: '' },
      }),
      cookies: cookies as never,
      env: validPublic,
      isProduction: true,
    });
    expect(client).toBeTruthy();
    expect(tryCreateSupabaseUserClient({
      request: new Request('https://example.com'),
      cookies: cookies as never,
      env: {},
    })).toBeNull();
  });

  it('refuses privileged client without secret key', () => {
    expect(() => createSupabaseServiceClient(validPublic)).toThrow(/secret configuration/i);
    expect(tryCreateSupabaseServiceClient(validPublic)).toBeNull();
    const privileged = createSupabaseServiceClient(validSecret);
    expect(privileged).toBeTruthy();
  });
});

describe('supabase auth foundation', () => {
  it('requireStudioAdmin rejects after authenticated-user scaffolding without membership', async () => {
    const client = {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: 'user-1',
              email: 'owner@chexustudio.com',
              aud: 'authenticated',
              role: 'authenticated',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          },
          error: null,
        })),
      },
    };

    await expect(requireStudioAdmin(client as never)).rejects.toBeInstanceOf(StudioAuthError);
    await expect(requireStudioAdmin(client as never)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('supabase module boundaries', () => {
  it('browser module never references server module or secret env key', () => {
    const browserSrc = readFileSync(
      path.join(process.cwd(), 'src/lib/supabase/browser.ts'),
      'utf8',
    );
    expect(browserSrc).not.toMatch(/from ['"]\.\/server['"]/);
    expect(browserSrc).not.toContain('SUPABASE_SECRET_KEY');
    expect(browserSrc).not.toContain('createSupabaseServiceClient');
  });

  it('placeholder database types contain no business tables yet', () => {
    const typesSrc = readFileSync(
      path.join(process.cwd(), 'src/lib/supabase/database.types.ts'),
      'utf8',
    );
    expect(typesSrc).not.toMatch(/\bclients\b/);
    expect(typesSrc).not.toMatch(/\binvoices\b/);
    expect(typesSrc).toContain('Record<string, never>');
  });
});
