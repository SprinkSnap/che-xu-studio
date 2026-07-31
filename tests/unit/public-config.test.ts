import { describe, expect, it } from 'vitest';
import { resolvePublicTurnstileSiteKey } from '../../src/lib/public-config';

describe('resolvePublicTurnstileSiteKey', () => {
  it('prefers runtime Worker vars over build-time env', () => {
    expect(
      resolvePublicTurnstileSiteKey({
        runtime: 'runtime-key',
        build: 'build-key',
      }),
    ).toBe('runtime-key');
  });

  it('falls back to build-time env', () => {
    expect(
      resolvePublicTurnstileSiteKey({
        runtime: '  ',
        build: 'build-key',
      }),
    ).toBe('build-key');
  });

  it('returns empty string when unset', () => {
    expect(resolvePublicTurnstileSiteKey({})).toBe('');
  });
});
