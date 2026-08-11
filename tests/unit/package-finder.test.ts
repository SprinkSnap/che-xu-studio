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

  it('recommends brand identity for branding path', () => {
    const result = recommendPackage({ need: 'branding' });
    expect(result?.packageId).toBe('brand-identity');
  });

  it('recommends custom+seo when new website and seo yes', () => {
    const result = recommendPackage({ need: 'new-website', seo: 'yes' });
    expect(result?.packageId).toBe('custom-seo-launch');
  });

  it('recommends custom+seo when unsure', () => {
    const result = recommendPackage({ need: 'new-website', seo: 'unsure' });
    expect(result?.packageId).toBe('custom-seo-launch');
  });

  it('recommends custom website when seo not needed', () => {
    const result = recommendPackage({ need: 'new-website', seo: 'no' });
    expect(result?.packageId).toBe('custom-website');
  });

  it('returns null until enough answers exist', () => {
    expect(recommendPackage({})).toBeNull();
    expect(recommendPackage({ need: 'new-website' })).toBeNull();
  });
});
