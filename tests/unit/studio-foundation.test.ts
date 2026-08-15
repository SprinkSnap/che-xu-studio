import { describe, expect, it } from 'vitest';
import {
  isClientDocumentPath,
  isStudioAdminPath,
  isStudioOsEnabled,
  isStudioPrivatePath,
  STUDIO_CACHE_CONTROL,
  STUDIO_ROBOTS_HEADER,
} from '../../src/lib/studio/private-paths';
import { isStudioNavActive, studioNavItems } from '../../src/lib/studio/navigation';
import {
  assertPublicSitemapPath,
  getPublicSitemapPaths,
} from '../../src/lib/studio/sitemap';

describe('studio private paths', () => {
  it('detects admin and client document families', () => {
    expect(isStudioAdminPath('/admin')).toBe(true);
    expect(isStudioAdminPath('/admin/clients')).toBe(true);
    expect(isStudioAdminPath('/about')).toBe(false);
    expect(isClientDocumentPath('/proposal/abc')).toBe(true);
    expect(isClientDocumentPath('/invoice/xyz')).toBe(true);
    expect(isStudioPrivatePath('/admin/invoices')).toBe(true);
    expect(isStudioPrivatePath('/api/studio/health')).toBe(true);
    expect(isStudioPrivatePath('/api/studio/jobs/process')).toBe(true);
    expect(isStudioPrivatePath('/pricing')).toBe(false);
    expect(isStudioPrivatePath('/api/contact')).toBe(false);
  });

  it('exposes stable robots and cache constants', () => {
    expect(STUDIO_ROBOTS_HEADER).toBe('noindex, nofollow, noarchive');
    expect(STUDIO_CACHE_CONTROL).toBe('private, no-store');
  });

  it('enables Studio OS in dev without an explicit flag', () => {
    expect(isStudioOsEnabled({ isDev: true })).toBe(true);
    expect(isStudioOsEnabled({ isDev: false })).toBe(false);
    expect(isStudioOsEnabled({ isDev: false, studioOsEnabled: 'true' })).toBe(true);
  });
});

describe('studio navigation', () => {
  it('lists the eight Phase 2 destinations', () => {
    expect(studioNavItems.map((item) => item.href)).toEqual([
      '/admin',
      '/admin/clients',
      '/admin/projects',
      '/admin/proposals',
      '/admin/invoices',
      '/admin/payments',
      '/admin/templates',
      '/admin/settings',
    ]);
  });

  it('marks nested routes active without highlighting Dashboard', () => {
    expect(isStudioNavActive('/admin', '/admin')).toBe(true);
    expect(isStudioNavActive('/admin/clients', '/admin')).toBe(false);
    expect(isStudioNavActive('/admin/clients', '/admin/clients')).toBe(true);
    expect(isStudioNavActive('/admin/clients/new', '/admin/clients')).toBe(true);
  });
});

describe('public sitemap allowlist', () => {
  it('never includes Studio private route families', () => {
    const paths = getPublicSitemapPaths();
    expect(paths.some((path) => path.startsWith('/admin'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/proposal'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/invoice'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/api'))).toBe(false);
    expect(paths).toContain('/');
    expect(paths).toContain('/pricing');
    expect(assertPublicSitemapPath('/admin')).toBe(false);
    expect(assertPublicSitemapPath('/proposal/x')).toBe(false);
    expect(assertPublicSitemapPath('/contact')).toBe(true);
  });
});
