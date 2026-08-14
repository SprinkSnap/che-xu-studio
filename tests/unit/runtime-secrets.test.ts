import { describe, expect, it } from 'vitest';
import { collectRuntimeSecrets, RUNTIME_SECRET_KEYS } from '../../scripts/runtime-secrets.mjs';

describe('collectRuntimeSecrets', () => {
  it('collects known trimmed secrets only', () => {
    const secrets = collectRuntimeSecrets({
      TURNSTILE_SECRET_KEY: '  turnstile-secret  ',
      RESEND_API_KEY: 're_test',
      SUPABASE_SECRET_KEY: '  sb_secret_test  ',
      PUBLIC_TURNSTILE_SITE_KEY: 'should-not-include',
      PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'should-not-include',
      EMPTY: '',
    });

    expect(Object.keys(secrets).sort()).toEqual([...RUNTIME_SECRET_KEYS].sort());
    expect(secrets.TURNSTILE_SECRET_KEY).toBe('turnstile-secret');
    expect(secrets.RESEND_API_KEY).toBe('re_test');
    expect(secrets.SUPABASE_SECRET_KEY).toBe('sb_secret_test');
  });

  it('returns empty object when secrets are missing', () => {
    expect(collectRuntimeSecrets({})).toEqual({});
  });
});
