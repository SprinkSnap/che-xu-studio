import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLAN_IDS,
  formatCad,
  getPackageById,
  isValidPlanId,
  packages,
  resolvePlanId,
} from '../../src/config/packages';

describe('packages data integrity', () => {
  it('contains exactly five packages', () => {
    expect(packages).toHaveLength(5);
  });

  it('has unique ids and slugs', () => {
    const ids = packages.map((p) => p.id);
    const slugs = packages.map((p) => p.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('matches published starting prices', () => {
    expect(getPackageById('brand-identity')?.startingPriceCad).toBe(1499);
    expect(getPackageById('custom-website')?.startingPriceCad).toBe(4999);
    expect(getPackageById('custom-seo-launch')?.startingPriceCad).toBe(6999);
    expect(getPackageById('seo-growth')?.startingPriceCad).toBe(499);
    expect(getPackageById('website-care')?.startingPriceCad).toBe(199);
  });

  it('marks custom+seo as most popular', () => {
    expect(getPackageById('custom-seo-launch')?.popular).toBe(true);
  });

  it('orders packages brand → custom → seo launch → growth → care', () => {
    expect(packages.map((p) => p.id)).toEqual([
      'brand-identity',
      'custom-website',
      'custom-seo-launch',
      'seo-growth',
      'website-care',
    ]);
  });

  it('exposes allowlisted plan ids', () => {
    expect(ALLOWED_PLAN_IDS).toEqual(packages.map((p) => p.id));
    expect(isValidPlanId('brand-identity')).toBe(true);
    expect(isValidPlanId('premium-theme')).toBe(false);
    expect(isValidPlanId('hacked')).toBe(false);
  });

  it('maps legacy premium-theme plan ids', () => {
    expect(resolvePlanId('premium-theme')).toBe('custom-website');
    expect(resolvePlanId('premium-theme-website')).toBe('custom-website');
    expect(resolvePlanId('custom-seo-launch')).toBe('custom-seo-launch');
    expect(resolvePlanId('unknown')).toBeUndefined();
  });

  it('formats CAD with en-CA currency', () => {
    expect(formatCad(1499)).toMatch(/\$1,499/);
  });

  it('requires disclosures and inclusions', () => {
    for (const pkg of packages) {
      expect(pkg.includes.length).toBeGreaterThan(3);
      expect(pkg.disclosures.length).toBeGreaterThan(0);
      expect(pkg.priceLabel.startsWith('CAD')).toBe(true);
    }
  });

  it('avoids WordPress and commercial-theme positioning in package copy', () => {
    const blob = packages.map((p) => `${p.name} ${p.summary} ${p.includes.join(' ')}`).join(' ');
    expect(blob.toLowerCase()).not.toMatch(/wordpress/);
    expect(blob.toLowerCase()).not.toMatch(/premium theme/);
  });
});
