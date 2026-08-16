import { test, expect } from '@playwright/test';

/**
 * Phase 12 email / reminders e2e (auth-gated admin surfaces).
 * Full provider send flows need Resend + STUDIO_E2E credentials.
 */

test.describe('Studio email & reminders', () => {
  test('email preview and settings redirect when unauthenticated', async ({ page }) => {
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/settings/email-preview');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('jobs process endpoint rejects missing cron secret', async ({ request }) => {
    const response = await request.post('/api/studio/jobs/process', {
      data: {},
    });
    // 404 when CRON_SECRET unset; 401 when set but Authorization missing
    expect([401, 404]).toContain(response.status());
  });

  test('authenticated settings and email preview render templates', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText(/Payment reminders/i)).toBeVisible();

    await page.goto('/admin/settings/email-preview?template=proposal');
    await expect(page.getByText(/Open your proposal/i).first()).toBeVisible();
    await page.getByRole('link', { name: 'invoice' }).click();
    await expect(page.getByText(/Open your invoice/i).first()).toBeVisible();
  });
});
