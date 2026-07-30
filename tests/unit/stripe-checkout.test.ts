import { describe, expect, it } from 'vitest';
import { getPackageById } from '../../src/config/packages';
import { resolveCheckoutMode, resolveStripePriceId } from '../../src/lib/stripe';

describe('server-side checkout mode resolution', () => {
  it('uses subscription mode when monthly price configured', () => {
    const pkg = getPackageById('seo-growth')!;
    const mode = resolveCheckoutMode(pkg, {
      STRIPE_PRICE_SEO_GROWTH: 'price_123',
    });
    expect(mode).toBe('subscription');
    expect(resolveStripePriceId(pkg, { STRIPE_PRICE_SEO_GROWTH: 'price_123' })).toBe('price_123');
  });

  it('falls back to quote for starting-at projects without fixed price', () => {
    const pkg = getPackageById('custom-website')!;
    expect(resolveCheckoutMode(pkg, {})).toBe('quote');
  });

  it('uses deposit when deposit price configured and no fixed package price', () => {
    const pkg = getPackageById('premium-theme')!;
    expect(
      resolveCheckoutMode(pkg, {
        STRIPE_PRICE_PROJECT_DEPOSIT: 'price_deposit',
      }),
    ).toBe('deposit');
  });

  it('uses fixed_price only from server allowlisted env mapping', () => {
    const pkg = getPackageById('premium-theme')!;
    expect(
      resolveCheckoutMode(pkg, {
        STRIPE_PRICE_PREMIUM_THEME: 'price_fixed',
      }),
    ).toBe('fixed_price');
  });

  it('never reads browser-supplied price ids (no such parameter accepted)', () => {
    const pkg = getPackageById('website-care')!;
    // resolveStripePriceId only consults env keys — not arbitrary client input
    expect(resolveStripePriceId(pkg, { STRIPE_PRICE_WEBSITE_CARE: '' })).toBeUndefined();
    expect(resolveStripePriceId(pkg, {})).toBeUndefined();
  });
});
