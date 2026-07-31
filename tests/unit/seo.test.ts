import { describe, expect, it } from 'vitest';
import {
  faqPageSchema,
  jsonLd,
  offerCatalogSchema,
  organizationSchema,
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
    expect(blob).not.toContain('AggregateRating');
    expect(blob).not.toContain('<');
  });

  it('builds site navigation schema with all primary destinations', () => {
    const nav = siteNavigationSchema('https://chexustudio.com');
    expect(nav['@type']).toBe('SiteNavigationElement');
    expect(nav.hasPart).toEqual(
      expect.arrayContaining([
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

  it('builds FAQ schema only from provided visible items', () => {
    const subset = faqs.slice(0, 2);
    const schema = faqPageSchema(subset);
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema['@type']).toBe('FAQPage');
  });
});
