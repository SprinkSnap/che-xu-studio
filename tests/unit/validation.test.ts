import { describe, expect, it } from 'vitest';
import { chatRequestSchema, contactSchema } from '../../src/lib/validation';

describe('contact validation', () => {
  it('accepts a valid short form payload', () => {
    const parsed = contactSchema.safeParse({
      name: 'Alex Example',
      email: 'alex@example.com',
      serviceInterest: 'seo-growth',
      message: 'Looking for monthly SEO help.',
      marketingConsent: false,
      turnstileToken: 'token',
      website: '',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects honeypot content via max length 0', () => {
    const parsed = contactSchema.safeParse({
      name: 'Alex',
      email: 'alex@example.com',
      serviceInterest: 'other',
      message: 'Hi',
      turnstileToken: 'token',
      website: 'http://spam.test',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('chat validation', () => {
  it('enforces history and message limits', () => {
    const ok = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'How much for a website?' }],
    });
    expect(ok.success).toBe(true);

    const tooLong = chatRequestSchema.safeParse({
      messages: [{ role: 'user', content: 'x'.repeat(2001) }],
    });
    expect(tooLong.success).toBe(false);
  });
});
