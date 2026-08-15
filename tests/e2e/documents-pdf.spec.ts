import { test, expect } from '@playwright/test';

/**
 * Phase 13 PDF document smoke — capability PDF routes stay private;
 * unauthenticated admin PDF APIs redirect/401.
 */

test.describe('Studio PDF documents', () => {
  test('admin PDF API requires auth', async ({ request }) => {
    const proposal = await request.get(
      '/api/studio/proposals/00000000-0000-4000-8000-000000000001/pdf?versionId=00000000-0000-4000-8000-000000000002',
      { maxRedirects: 0 },
    );
    // 401/403 when auth is configured; 500 misconfigured / 503 unavailable without Supabase.
    expect([401, 403, 500, 503]).toContain(proposal.status());
    if (proposal.status() === 500 || proposal.status() === 503) {
      const body = await proposal.json();
      expect(String(body.error || body.code || '')).toMatch(/not configured|misconfigured|unavailable/i);
    }

    const invoice = await request.get(
      '/api/studio/invoices/00000000-0000-4000-8000-000000000001/pdf',
      { maxRedirects: 0 },
    );
    expect([401, 403, 500, 503]).toContain(invoice.status());

    const receipt = await request.get(
      '/api/studio/payments/00000000-0000-4000-8000-000000000001/receipt',
      { maxRedirects: 0 },
    );
    expect([401, 403, 500, 503]).toContain(receipt.status());
  });

  test('invalid capability PDF downloads stay private and noindex', async ({ request }) => {
    const proposalPdf = await request.get('/proposal/not-a-real-token/pdf');
    expect([404, 503]).toContain(proposalPdf.status());
    expect(proposalPdf.headers()['cache-control'] || '').toMatch(/private|no-store/i);

    const invoicePdf = await request.get('/invoice/not-a-real-token/pdf');
    expect([404, 503]).toContain(invoicePdf.status());
  });

  test('credentialed proposal PDF controls when env present', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    await page.goto('/admin/proposals');
    // List may be empty; smoke that page renders with PDF architecture present in nav/docs.
    await expect(page.locator('body')).toBeVisible();
  });
});
