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
      '/services/branding',
      '/services/web-design',
      '/services/seo',
      '/services/website-care',
      '/pricing',
      '/work',
      '/about',
      '/contact',
    ]);
    expect(destinations.filter((d) => d.group === 'Services')).toHaveLength(4);
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
        '/services/branding',
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
    expect(siteConfig.cta.primary.href).toBe('/contact?intent=quote');
    expect(siteConfig.cta.primary.label).toBe('Get a Project Quote');
    expect(siteConfig.cta.secondary.href).toBe('/#package-finder');
    expect(siteConfig.cta.secondary.label).toBe('Find My Best Package');
    expect(siteConfig.defaultSiteUrl).toBe('https://chexustudio.com');
    expect(siteConfig.contact.email).toBe('info@chexustudio.com');
    expect(siteConfig.allowIndexing).toBe(false);
  });

  it('includes the NorthLine HOME SERVICES portfolio concept with brief and mockup', () => {
    expect(siteConfig.projects.length).toBeGreaterThan(0);
    const northline = siteConfig.projects.find((p) => p.id === 'northline-home-services');
    expect(northline).toBeDefined();
    expect(northline?.slug).toBe('northline-home-services');
    expect(northline?.projectKind).toBe('concept');
    expect(northline?.featured).toBe(true);
    expect(northline?.title).toBe('NorthLine HOME SERVICES');
    expect(northline?.summary).toMatch(/home-services/i);
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
    expect(northline?.note).toMatch(/Concept project/i);
    expect(northline?.imageSrc).toBe('/images/work/northline-home-service-responsive-mockup.png');
    expect(northline?.href).toBe('https://northline-demo.chexustudio.com');
    expect(northline?.hrefLabel).toBe('View live demo');
  });

  it('includes the hospitality restaurant portfolio concept', () => {
    const hospitality = siteConfig.projects.find((p) => p.id === 'seasonal-restaurant-concept');
    expect(hospitality).toBeDefined();
    expect(hospitality?.slug).toBe('tablekind-kitchen');
    expect(hospitality?.projectKind).toBe('concept');
    expect(hospitality?.featured).toBe(true);
    expect(hospitality?.title).toBe('Tablekind Kitchen');
    expect(hospitality?.summary).toMatch(/reservations/i);
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
    expect(hospitality?.note).toMatch(/reservations/i);
    expect(hospitality?.imageSrc).toBe(
      '/images/work/tablekind-kitchen-restaurant-website-design-responsive-mockup-1.png',
    );
    expect(hospitality?.href).toBe('https://tablekindkitchen.chexustudio.com/');
    expect(hospitality?.hrefLabel).toBe('View live demo');
  });

  it('includes Harbour & Pine Home e-commerce demo after Tablekind Kitchen', () => {
    const projects = siteConfig.projects;
    const tablekindIndex = projects.findIndex((p) => p.id === 'seasonal-restaurant-concept');
    const residentialIndex = projects.findIndex(
      (p) => p.id === 'residential-home-services-concept',
    );
    expect(tablekindIndex).toBeGreaterThanOrEqual(0);
    expect(residentialIndex).toBe(tablekindIndex + 1);

    const residential = projects[residentialIndex];
    expect(residential?.slug).toBe('harbour-pine-home');
    expect(residential?.projectKind).toBe('concept');
    expect(residential?.title).toBe('Harbour & Pine Home');
    expect(residential?.summary).toMatch(/storefront/i);
    expect(residential?.industry).toBe('Home Décor & Lifestyle E-commerce');
    expect(residential?.industryDetail).toMatch(/curated furniture/i);
    expect(residential?.websiteGoal).toMatch(/does not accept real orders/i);
    expect(residential?.role).toMatch(/storefront experience/i);
    expect(residential?.technologies).toEqual(
      expect.arrayContaining(['Astro 7', 'React 19', 'Cloudflare D1', 'Turnstile']),
    );
    expect(residential?.conversionFocus).toMatch(/demo checkout/i);
    expect(residential?.seoImplementation).toMatch(/noindex/i);
    expect(residential?.note).toMatch(/does not accept real orders/i);
    expect(residential?.imageSrc).toBe(
      '/images/work/harbour-pine-home-responsive-ecommerce-website-mockup.png',
    );
    expect(residential?.href).toBe('https://harbourandpinehome.chexustudio.com/');
    expect(residential?.hrefLabel).toBe('View live demo');
  });

  it('includes an interior-design concept after Harbour & Pine Home', () => {
    const projects = siteConfig.projects;
    const harbourIndex = projects.findIndex((p) => p.id === 'residential-home-services-concept');
    const interiorIndex = projects.findIndex(
      (p) => p.id === 'interior-design-home-improvement-concept',
    );
    expect(harbourIndex).toBeGreaterThanOrEqual(0);
    expect(interiorIndex).toBe(harbourIndex + 1);

    const interior = projects[interiorIndex];
    expect(interior?.slug).toBe('form-field-interiors');
    expect(interior?.projectKind).toBe('concept');
    expect(interior?.featured).toBe(true);
    expect(interior?.title).toBe('Form & Field Interiors');
    expect(interior?.summary).toMatch(/interior-design/i);
    expect(interior?.industry).toBe('Interior Design & Home Improvement');
    expect(interior?.industryDetail).toMatch(/visually appealing/i);
    expect(interior?.websiteGoal).toMatch(/qualified inquiries/i);
    expect(interior?.role).toMatch(/front-end experience/i);
    expect(interior?.technologies).toEqual(
      expect.arrayContaining(['HTML', 'CSS', 'JavaScript', 'Responsive Design']),
    );
    expect(interior?.conversionFocus).toMatch(/prospective clients/i);
    expect(interior?.note).toMatch(/Concept project/i);
    expect(interior?.imageSrc).toBe(
      '/images/work/form-and-field-interiors-responsive-website-mockup.webp',
    );
    expect(interior?.href).toBe('https://formandfieldinteriors.chexustudio.com/');
    expect(interior?.hrefLabel).toBe('View live demo');
  });

  it('includes SignalFlow CRM after Form & Field Interiors', () => {
    const projects = siteConfig.projects;
    const interiorIndex = projects.findIndex(
      (p) => p.id === 'interior-design-home-improvement-concept',
    );
    const signalFlowIndex = projects.findIndex((p) => p.id === 'signalflow-crm-concept');
    expect(interiorIndex).toBeGreaterThanOrEqual(0);
    expect(signalFlowIndex).toBe(interiorIndex + 1);

    const signalFlow = projects[signalFlowIndex];
    expect(signalFlow?.slug).toBe('signalflow-crm');
    expect(signalFlow?.projectKind).toBe('concept');
    expect(signalFlow?.title).toBe('SignalFlow CRM');
    expect(signalFlow?.summary).toMatch(/CRM/i);
    expect(signalFlow?.industry).toBe('B2B SaaS / CRM Software');
    expect(signalFlow?.industryDetail).toMatch(/fictional CRM product/i);
    expect(signalFlow?.websiteGoal).toMatch(/interactive browser-based demo/i);
    expect(signalFlow?.role).toMatch(/interactive CRM demo/i);
    expect(signalFlow?.technologies).toEqual(
      expect.arrayContaining([
        'Astro 7',
        'React 19',
        'Cloudflare Workers',
        'Workers AI',
        'Axe accessibility testing',
      ]),
    );
    expect(signalFlow?.conversionFocus).toMatch(/plan recommendations/i);
    expect(signalFlow?.seoImplementation).toMatch(/noindex\/nofollow/i);
    expect(signalFlow?.note).toMatch(/Concept project/i);
    expect(signalFlow?.imageSrc).toBe(
      '/images/work/signalflow-crm-saas-website-responsive-mockup.png',
    );
    expect(signalFlow?.href).toBe('https://signalflowcrm.chexustudio.com/');
    expect(signalFlow?.hrefLabel).toBe('View live demo');
  });

  it('includes LocalPro Directory after SignalFlow CRM', () => {
    const projects = siteConfig.projects;
    const signalFlowIndex = projects.findIndex((p) => p.id === 'signalflow-crm-concept');
    const localProIndex = projects.findIndex((p) => p.id === 'localpro-directory-concept');
    expect(signalFlowIndex).toBeGreaterThanOrEqual(0);
    expect(localProIndex).toBe(signalFlowIndex + 1);

    const localPro = projects[localProIndex];
    expect(localPro?.slug).toBe('localpro-directory');
    expect(localPro?.projectKind).toBe('concept');
    expect(localPro?.title).toBe('LocalPro Directory');
    expect(localPro?.summary).toMatch(/directory/i);
    expect(localPro?.industry).toBe('Local Services & Professional Directory Marketplace');
    expect(localPro?.industryDetail).toMatch(/fictional local-services/i);
    expect(localPro?.websiteGoal).toMatch(/discover, compare, save, and request quotes/i);
    expect(localPro?.role).toMatch(/Full-stack developer and UX designer/i);
    expect(localPro?.technologies).toEqual(
      expect.arrayContaining([
        'Astro 5',
        'React 19',
        'Cloudflare Workers',
        'Cloudflare D1',
        'Optional Workers AI',
      ]),
    );
    expect(localPro?.conversionFocus).toMatch(/quote-request journeys/i);
    expect(localPro?.seoImplementation).toMatch(/noindex, nofollow/i);
    expect(localPro?.note).toMatch(/Concept project/i);
    expect(localPro?.imageSrc).toBe(
      '/images/work/localpro-directory-responsive-local-services-website-mockup.webp',
    );
    expect(localPro?.href).toBe('https://localprodirectory.chexustudio.com/');
    expect(localPro?.hrefLabel).toBe('View live demo');
  });

  it('exposes featured homepage projects and internal project paths', () => {
    const featured = siteConfig.projects.filter((p) => p.featured);
    expect(featured).toHaveLength(3);
    expect(featured.map((p) => p.slug)).toEqual([
      'northline-home-services',
      'tablekind-kitchen',
      'form-field-interiors',
    ]);
    expect(siteConfig.projects.every((p) => p.slug && p.projectKind)).toBe(true);
  });
  it('structures footer into services, studio, and legal groups', () => {
    const serviceHrefs = siteConfig.footer.services.map((l) => l.href);
    const studioHrefs = siteConfig.footer.studio.map((l) => l.href);
    const legalHrefs = siteConfig.footer.legal.map((l) => l.href);

    expect(serviceHrefs).toEqual(
      expect.arrayContaining(['/pricing', '/services/branding', '/services/web-design']),
    );
    expect(studioHrefs).toEqual(expect.arrayContaining(['/work', '/about', '/contact']));
    expect(legalHrefs).toEqual(
      expect.arrayContaining(['/privacy', '/terms', '/refund-cancellation-policy']),
    );
    expect(siteConfig.footer.services.every((link) => link.description)).toBe(true);
    expect(siteConfig.footer.cta.headline).toMatch(/website project/i);

    const allFooterHrefs = [...serviceHrefs, ...studioHrefs, ...legalHrefs];
    expect(allFooterHrefs.includes('/insights' as (typeof allFooterHrefs)[number])).toBe(false);
    expect(allFooterHrefs.every((href) => !href.includes('#'))).toBe(true);
  });
});
