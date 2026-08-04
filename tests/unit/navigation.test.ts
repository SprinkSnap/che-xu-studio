import { describe, expect, it } from 'vitest';
import {
  flattenNavDestinations,
  isCurrentPath,
  isNavItemActive,
  normalizePath,
  type NavItem,
} from '../../src/lib/navigation';
import { siteConfig } from '../../src/config/site';

describe('navigation path helpers', () => {
  it('normalizes trailing slashes and fragments', () => {
    expect(normalizePath('/pricing/')).toBe('/pricing');
    expect(normalizePath('/pricing#plans')).toBe('/pricing');
    expect(normalizePath('/')).toBe('/');
  });

  it('detects current paths with or without trailing slash', () => {
    expect(isCurrentPath('/about/', '/about')).toBe(true);
    expect(isCurrentPath('/about', '/contact')).toBe(false);
  });

  it('marks Services active for nested service routes', () => {
    const services = siteConfig.navigation.find((item) => item.label === 'Services') as NavItem;
    expect(services).toBeTruthy();
    expect(isNavItemActive('/services/seo/', services)).toBe(true);
    expect(isNavItemActive('/pricing', services)).toBe(false);
  });

  it('flattens Services children into mobile destinations', () => {
    const destinations = flattenNavDestinations(siteConfig.navigation);
    expect(destinations.map((d) => d.href)).toEqual([
      '/',
      '/services/web-design',
      '/services/seo',
      '/services/website-care',
      '/pricing',
      '/work',
      '/about',
      '/contact',
    ]);
    expect(destinations.filter((d) => d.group === 'Services')).toHaveLength(3);
  });
});

describe('site navigation integrity', () => {
  it('exposes required primary destinations without placeholder hashes', () => {
    const items = siteConfig.navigation as readonly NavItem[];
    const hrefs = items.flatMap((item) => [
      ...(item.href ? [item.href] : []),
      ...(item.children?.map((child) => child.href) ?? []),
    ]);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/',
        '/services/web-design',
        '/services/seo',
        '/services/website-care',
        '/pricing',
        '/work',
        '/about',
        '/contact',
      ]),
    );
    expect(hrefs.every((href) => href !== '#')).toBe(true);
    expect(siteConfig.cta.primary.href).toBe('/#package-finder');
    expect(siteConfig.defaultSiteUrl).toBe('https://chexustudio.com');
    expect(siteConfig.contact.email).toBe('info@chexustudio.com');
  });

  it('includes the NorthLine HOME SERVICES portfolio concept with brief and mockup', () => {
    expect(siteConfig.projects.length).toBeGreaterThan(0);
    const northline = siteConfig.projects.find((p) => p.id === 'northline-home-services');
    expect(northline).toBeDefined();
    expect(northline?.title).toBe('NorthLine HOME SERVICES');
    expect(northline?.summary).toMatch(/Desktop view, mobile-responsive conversion/i);
    expect(northline?.industry).toBe('Home Services');
    expect(northline?.industryDetail).toMatch(/residential home services/i);
    expect(northline?.websiteGoal).toMatch(/conversion-focused website/i);
    expect(northline?.roles).toEqual(
      expect.arrayContaining(['WordPress Development', 'Technical SEO Implementation']),
    );
    expect(northline?.technologies).toEqual(
      expect.arrayContaining(['WordPress', 'PHP', 'Accessibility (WCAG)']),
    );
    expect(northline?.conversionFocus).toMatch(/qualified leads/i);
    expect(northline?.seoImplementation).toMatch(/local SEO foundations/i);
    expect(northline?.note).toMatch(/Fictional demonstration/i);
    expect(northline?.imageSrc).toBe('/images/work/northline-home-service-responsive-mockup.png');
    expect(northline?.href).toBe('https://northline-demo.chexustudio.com');
    expect(northline?.hrefLabel).toBe('View live demo');
  });

  it('includes the hospitality restaurant portfolio concept', () => {
    const hospitality = siteConfig.projects.find((p) => p.id === 'seasonal-restaurant-concept');
    expect(hospitality).toBeDefined();
    expect(hospitality?.title).toBe('Tablekind Kitchen');
    expect(hospitality?.summary).toMatch(/Desktop view, mobile-responsive conversion/i);
    expect(hospitality?.industry).toBe('Hospitality & Food Service');
    expect(hospitality?.industryDetail).toMatch(/seasonal, community-focused restaurant/i);
    expect(hospitality?.websiteGoal).toMatch(/book a table/i);
    expect(hospitality?.roles).toEqual(
      expect.arrayContaining([
        'Interactive Reservation & Ordering Experiences',
        'Cloudflare Deployment & Security',
      ]),
    );
    expect(hospitality?.technologies).toEqual(
      expect.arrayContaining(['Astro', 'Cloudflare Workers', 'Workers AI']),
    );
    expect(hospitality?.note).toMatch(/reservations and ordering flows/i);
  });

  it('structures footer into services, studio, and legal groups', () => {
    const serviceHrefs = siteConfig.footer.services.map((l) => l.href);
    const studioHrefs = siteConfig.footer.studio.map((l) => l.href);
    const legalHrefs = siteConfig.footer.legal.map((l) => l.href);

    expect(serviceHrefs).toEqual(expect.arrayContaining(['/pricing', '/services/web-design']));
    expect(studioHrefs).toEqual(expect.arrayContaining(['/work', '/about', '/contact']));
    expect(legalHrefs).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/refund-cancellation-policy']),
    );

    const allFooterHrefs = [...serviceHrefs, ...studioHrefs, ...legalHrefs];
    expect(allFooterHrefs.includes('/insights' as (typeof allFooterHrefs)[number])).toBe(false);
    expect(allFooterHrefs.every((href) => !href.includes('#'))).toBe(true);
  });
});
