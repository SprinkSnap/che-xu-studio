import { describe, expect, it } from 'vitest';
import { buildContactMailto } from '../../src/lib/contact-mailto';

describe('buildContactMailto', () => {
  it('builds a mailto URL with enquiry details', () => {
    const href = buildContactMailto('info@chexustudio.com', {
      name: 'Alex',
      email: 'alex@example.com',
      serviceInterest: 'seo-growth',
      message: 'Need help ranking locally.',
      phone: '555-0100',
    });

    expect(href.startsWith('mailto:info@chexustudio.com?')).toBe(true);
    const query = href.slice(href.indexOf('?') + 1);
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toContain('seo-growth');
    expect(params.get('body')).toContain('Alex');
    expect(params.get('body')).toContain('Need help ranking locally.');
    expect(params.get('body')).toContain('555-0100');
  });
});
