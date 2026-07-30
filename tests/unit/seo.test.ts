import { describe, expect, it } from 'vitest';
import { faqPageSchema, jsonLd, offerCatalogSchema, organizationSchema } from '../../src/lib/seo';
import { faqs } from '../../src/config/faq';

describe('structured data', () => {
  it('builds organization and offer catalog without fabricated ratings', () => {
    const org = organizationSchema('https://example.com');
    const catalog = offerCatalogSchema('https://example.com');
    const blob = jsonLd([org, catalog]);
    expect(blob).toContain('ProfessionalService');
    expect(blob).toContain('OfferCatalog');
    expect(blob).not.toContain('AggregateRating');
    expect(blob).not.toContain('<');
  });

  it('builds FAQ schema only from provided visible items', () => {
    const subset = faqs.slice(0, 2);
    const schema = faqPageSchema(subset);
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema['@type']).toBe('FAQPage');
  });
});
