import { describe, expect, it } from 'vitest';
import { buildLeadNotificationContent } from '../../src/lib/notify-email';

describe('buildLeadNotificationContent', () => {
  it('includes enquiry fields for the studio inbox', () => {
    const content = buildLeadNotificationContent(
      {
        name: 'Alex Example',
        email: 'alex@example.com',
        phone: '555-0100',
        serviceInterest: 'seo-growth',
        message: 'Need local SEO help.',
        marketingConsent: true,
        website: '',
        currentWebsite: '',
        businessType: '',
        primaryGoal: '',
        pagesFeatures: '',
        budgetRange: '',
        targetTimeline: '',
        preferredContact: 'email',
        turnstileToken: 'token',
      },
      { leadId: 'lead_123', createdAt: '2026-07-31T00:00:00.000Z' },
    );

    expect(content.subject).toContain('seo-growth');
    expect(content.subject).toContain('Alex Example');
    expect(content.text).toContain('alex@example.com');
    expect(content.text).toContain('Need local SEO help.');
    expect(content.text).toContain('lead_123');
    expect(content.html).toContain('Need local SEO help.');
  });
});
