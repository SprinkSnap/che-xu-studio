import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLeadNotificationContent,
  notifyLeadByEmail,
} from '../../src/lib/notify-email';

const sampleLead = {
  name: 'Alex Example',
  email: 'alex@example.com',
  phone: '555-0100',
  serviceInterest: 'seo-growth' as const,
  message: 'Need local SEO help.',
  marketingConsent: true,
  website: '',
  currentWebsite: '',
  businessType: '',
  primaryGoal: '',
  pagesFeatures: '',
  budgetRange: '' as const,
  targetTimeline: '' as const,
  preferredContact: 'email' as const,
  turnstileToken: 'token',
};

describe('buildLeadNotificationContent', () => {
  it('includes enquiry fields for the studio inbox', () => {
    const content = buildLeadNotificationContent(sampleLead, {
      leadId: 'lead_123',
      createdAt: '2026-07-31T00:00:00.000Z',
    });

    expect(content.subject).toContain('seo-growth');
    expect(content.subject).toContain('Alex Example');
    expect(content.text).toContain('alex@example.com');
    expect(content.text).toContain('Need local SEO help.');
    expect(content.text).toContain('lead_123');
    expect(content.html).toContain('Need local SEO help.');
  });
});

describe('notifyLeadByEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults From to info@chexustudio.com (not resend.dev sandbox)', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyLeadByEmail(
      { RESEND_API_KEY: 're_test' },
      sampleLead,
      {
        leadId: 'lead_123',
        createdAt: '2026-07-31T00:00:00.000Z',
        notifyTo: 'info@chexustudio.com',
      },
    );

    expect(result.sent).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.from).toBe('Che Xu Studio <info@chexustudio.com>');
    expect(body.to).toEqual(['info@chexustudio.com']);
  });

  it('rejects resend.dev From addresses', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await notifyLeadByEmail(
      {
        RESEND_API_KEY: 're_test',
        CONTACT_FROM_EMAIL: 'Che Xu Studio <onboarding@resend.dev>',
      },
      sampleLead,
      {
        leadId: 'lead_123',
        createdAt: '2026-07-31T00:00:00.000Z',
        notifyTo: 'info@chexustudio.com',
      },
    );

    expect(result).toEqual({ sent: false, error: 'invalid-from' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
