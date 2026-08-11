import { describe, expect, it } from 'vitest';
import {
  faqPageSchema,
  footerNavigationSchema,
  jsonLd,
  offerCatalogSchema,
  organizationSchema,
  portfolioProjectSchema,
  siteNavigationSchema,
} from '../../src/lib/seo';
import { faqs } from '../../src/config/faq';

describe('structured data', () => {
  it('builds organization and offer catalog without fabricated ratings', () => {
    const org = organizationSchema('https://chexustudio.com');
    const catalog = offerCatalogSchema('https://chexustudio.com');
    const blob = jsonLd([org, catalog]);
    expect(blob).toContain('ProfessionalService');
    expect(blob).toContain('OfferCatalog');
    expect(blob).toContain('info@chexustudio.com');
    expect(blob).not.toContain('AggregateRating');
    expect(blob).not.toContain('<');
  });

  it('builds site navigation schema with all primary destinations', () => {
    const nav = siteNavigationSchema('https://chexustudio.com');
    expect(nav['@type']).toBe('SiteNavigationElement');
    expect(nav.hasPart).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Branding',
          url: 'https://chexustudio.com/services/branding',
        }),
        expect.objectContaining({
          name: 'SEO Strategy',
          url: 'https://chexustudio.com/services/seo',
        }),
        expect.objectContaining({
          name: 'Web Design',
          url: 'https://chexustudio.com/services/web-design',
        }),
        expect.objectContaining({ name: 'Pricing', url: 'https://chexustudio.com/pricing' }),
        expect.objectContaining({ name: 'Contact', url: 'https://chexustudio.com/contact' }),
      ]),
    );
  });

  it('builds footer navigation schema with descriptive link metadata', () => {
    const footerNav = footerNavigationSchema('https://chexustudio.com');
    expect(footerNav['@type']).toBe('SiteNavigationElement');
    expect(footerNav.name).toBe('Footer');
    expect(footerNav.hasPart).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Web Design',
          url: 'https://chexustudio.com/services/web-design',
          description: expect.stringMatching(/conversion-focused/i),
        }),
        expect.objectContaining({
          name: 'Refund & Cancellation Policy',
          url: 'https://chexustudio.com/refund-cancellation-policy',
        }),
      ]),
    );
    expect(footerNav.hasPart).toHaveLength(11);
  });

  it('builds FAQ schema only from provided visible items', () => {
    const subset = faqs.slice(0, 2);
    const schema = faqPageSchema(subset);
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema['@type']).toBe('FAQPage');
  });

  it('builds portfolio concept schema without fabricated ratings or client claims', () => {
    const schema = portfolioProjectSchema({
      name: 'NorthLine HOME SERVICES',
      description: 'Concept project summary',
      path: '/work/northline-home-services',
      projectKind: 'concept',
      siteUrl: 'https://chexustudio.com',
    });
    expect(schema['@type']).toBe('CreativeWork');
    expect(schema.genre).toBe('Portfolio concept');
    expect(JSON.stringify(schema)).not.toContain('AggregateRating');
    expect(JSON.stringify(schema)).not.toContain('CaseStudy');
  });
});
