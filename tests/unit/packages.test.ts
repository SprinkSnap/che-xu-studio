import { describe, expect, it } from 'vitest';
import {
  ALLOWED_PLAN_IDS,
  formatCad,
  getPackageById,
  isValidPlanId,
  packages,
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
    expect(getPackageById('premium-theme')?.startingPriceCad).toBe(1999);
    expect(getPackageById('custom-website')?.startingPriceCad).toBe(4999);
    expect(getPackageById('custom-seo-launch')?.startingPriceCad).toBe(6999);
    expect(getPackageById('seo-growth')?.startingPriceCad).toBe(499);
    expect(getPackageById('website-care')?.startingPriceCad).toBe(199);
  });

  it('marks custom+seo as most popular', () => {
    expect(getPackageById('custom-seo-launch')?.popular).toBe(true);
  });

  it('exposes allowlisted plan ids', () => {
    expect(ALLOWED_PLAN_IDS).toEqual(packages.map((p) => p.id));
    expect(isValidPlanId('premium-theme')).toBe(true);
    expect(isValidPlanId('hacked')).toBe(false);
  });

  it('formats CAD with en-CA currency', () => {
    expect(formatCad(1999)).toMatch(/\$1,999/);
  });

  it('requires disclosures and inclusions', () => {
    for (const pkg of packages) {
      expect(pkg.includes.length).toBeGreaterThan(3);
      expect(pkg.disclosures.length).toBeGreaterThan(0);
      expect(pkg.priceLabel.startsWith('CAD')).toBe(true);
    }
  });
});
