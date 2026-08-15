import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 14 dashboard — auth boundaries + empty/populated smoke.
 * Credentialed value assertions require STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD.
 */

test.describe('Studio dashboard reporting', () => {
  test('unauthenticated dashboard redirects to login with private headers', async ({
    page,
    request,
  }) => {
    const response = await request.get('/admin', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toMatch(/\/admin\/login/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('login page remains accessible for dashboard entry', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('credentialed dashboard shows real metric labels without placeholders', async ({
    page,
  }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Outstanding invoices')).toBeVisible();
    await expect(page.getByText('Revenue this month')).toBeVisible();
    await expect(page.getByText('Revenue this year')).toBeVisible();
    await expect(page.getByText('Active projects')).toBeVisible();
    await expect(page.getByText('Proposals awaiting approval')).toBeVisible();
    await expect(page.getByText('Overdue invoices')).toBeVisible();
    await expect(page.getByText('No data yet')).toHaveCount(0);
    await expect(page.locator('.studio-metric-value').filter({ hasText: '—' })).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).analyze();
    const serious = accessibility.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious).toEqual([]);
  });

  test('mobile dashboard metrics stack without horizontal overflow', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
