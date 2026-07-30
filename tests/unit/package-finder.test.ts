import { describe, expect, it } from 'vitest';
import { recommendPackage } from '../../src/lib/package-finder';

describe('package recommendation logic', () => {
  it('recommends website care for ongoing care', () => {
    const result = recommendPackage({ need: 'care' });
    expect(result?.packageId).toBe('website-care');
  });

  it('recommends seo growth for existing-site growth', () => {
    const result = recommendPackage({ need: 'growth' });
    expect(result?.packageId).toBe('seo-growth');
  });

  it('recommends premium theme for theme path', () => {
    const result = recommendPackage({ need: 'new-website', design: 'premium-theme' });
    expect(result?.packageId).toBe('premium-theme');
  });

  it('recommends custom+seo when custom and seo yes', () => {
    const result = recommendPackage({ need: 'new-website', design: 'custom', seo: 'yes' });
    expect(result?.packageId).toBe('custom-seo-launch');
  });

  it('recommends custom+seo when unsure', () => {
    const result = recommendPackage({ need: 'new-website', design: 'custom', seo: 'unsure' });
    expect(result?.packageId).toBe('custom-seo-launch');
  });

  it('recommends custom website when seo not needed', () => {
    const result = recommendPackage({ need: 'new-website', design: 'custom', seo: 'no' });
    expect(result?.packageId).toBe('custom-website');
  });

  it('returns null until enough answers exist', () => {
    expect(recommendPackage({})).toBeNull();
    expect(recommendPackage({ need: 'new-website' })).toBeNull();
    expect(recommendPackage({ need: 'new-website', design: 'custom' })).toBeNull();
  });
});
