import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, redactForLogs, securityHeaders } from '../../src/lib/security';

describe('origin checks', () => {
  it('allows matching origin', () => {
    const req = new Request('https://example.com/api/contact', {
      method: 'POST',
      headers: { Origin: 'https://example.com' },
    });
    expect(isAllowedOrigin(req, 'https://example.com')).toBe(true);
  });

  it('rejects foreign origin', () => {
    const req = new Request('https://example.com/api/contact', {
      method: 'POST',
      headers: { Origin: 'https://evil.test' },
    });
    expect(isAllowedOrigin(req, 'https://example.com')).toBe(false);
  });
});

describe('security headers', () => {
  it('includes CSP and frame protection', () => {
    const headers = securityHeaders(true);
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('log redaction', () => {
  it('redacts personal fields', () => {
    const out = redactForLogs({
      email: 'a@b.c',
      message: 'secret',
      serviceInterest: 'seo-growth',
    }) as Record<string, string>;
    expect(out.email).toBe('[redacted]');
    expect(out.message).toBe('[redacted]');
    expect(out.serviceInterest).toBe('seo-growth');
  });
});
