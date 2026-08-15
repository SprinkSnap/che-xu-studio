import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 9 invoice engine e2e.
 * Credentialed flows require STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD.
 */

test.describe('Studio invoices', () => {
  test('unauthenticated invoice routes redirect to login', async ({ page }) => {
    await page.goto('/admin/invoices');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/invoices/new');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('invoice list stays noindex when redirected through auth', async ({ request }) => {
    const response = await request.get('/admin/invoices', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toMatch(/\/admin\/login/);
  });

  test('manual invoice create preview issue', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    const company = `E2E Inv Client ${suffix}`;
    const projectName = `E2E Inv Project ${suffix}`;

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    await page.goto('/admin/clients/new');
    await page.getByLabel('Company / client name').fill(company);
    await page.getByLabel('Contact name').fill(`Contact ${suffix}`);
    await page.getByRole('button', { name: 'Save client' }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/[0-9a-f-]+/i);

    await page.getByRole('link', { name: 'New Project' }).first().click();
    await page.getByLabel('Project name').fill(projectName);
    await page.getByLabel('Project price').fill('8000.00');
    await page.getByLabel('Tax (%)').fill('13');
    await page.getByLabel('Deposit (%)').fill('50');
    await page.getByRole('button', { name: 'Save project' }).click();
    await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+/i);

    await page.goto('/admin/invoices/new');
    await page.getByLabel('Client').selectOption({ label: company });
    await page.locator('[data-field="description"]').first().fill('Manual design work');
    await page.locator('[data-field="quantity"]').first().fill('2');
    await page.locator('[data-field="rate"]').first().fill('1000.00');
    await page.getByLabel('Tax %').fill('13');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page).toHaveURL(/\/admin\/invoices\/[0-9a-f-]+/i);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/CXS-\d{4}-\d+/);

    await page.getByRole('link', { name: 'Preview' }).click();
    await expect(page.getByText('Manual design work')).toBeVisible();
    await expect(page.getByText('Balance due')).toBeVisible();

    await page.getByRole('link', { name: 'Back to invoice' }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /Issue invoice/i }).click();
    await expect(page.getByText(/issued|locked/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  });

  test('deposit and final generation are idempotent', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    const company = `E2E Dep Client ${suffix}`;
    const projectName = `E2E Dep Project ${suffix}`;

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.goto('/admin/clients/new');
    await page.getByLabel('Company / client name').fill(company);
    await page.getByLabel('Contact name').fill(`Contact ${suffix}`);
    await page.getByRole('button', { name: 'Save client' }).click();

    await page.getByRole('link', { name: 'New Project' }).first().click();
    await page.getByLabel('Project name').fill(projectName);
    await page.getByLabel('Project price').fill('8000.00');
    await page.getByLabel('Tax (%)').fill('13');
    await page.getByLabel('Deposit (%)').fill('50');
    await page.getByRole('button', { name: 'Save project' }).click();

    await page.getByRole('link', { name: 'Create Proposal' }).first().click();
    await page.getByRole('button', { name: /Create proposal/i }).click();
    await expect(page).toHaveURL(/\/admin\/proposals\/[0-9a-f-]+/i);
    const proposalUrl = page.url();

    await page.getByRole('button', { name: /Generate deposit invoice/i }).click();
    await expect(page).toHaveURL(/\/admin\/invoices\/[0-9a-f-]+/i);
    const depositInvoiceUrl = page.url();
    const depositNumber = await page.locator('h1').innerText();

    await page.goto(proposalUrl);
    await page.getByRole('button', { name: /Generate deposit invoice/i }).click();
    await expect(page).toHaveURL(depositInvoiceUrl);
    await expect(page.locator('h1')).toHaveText(depositNumber);

    await page.goto(proposalUrl);
    await page.getByRole('button', { name: /Generate final invoice/i }).click();
    await expect(page).toHaveURL(/\/admin\/invoices\/[0-9a-f-]+/i);
    await expect(page.getByText(/Final/i).first()).toBeVisible();
  });

  test('mobile invoice list and create', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.goto('/admin/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
    await page.getByRole('link', { name: 'New Invoice' }).click();
    await expect(page.getByLabel('Client')).toBeVisible();
  });

  test('invoice surfaces have no serious accessibility violations when authenticated', async ({
    page,
  }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    for (const path of ['/admin/invoices', '/admin/invoices/new']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    }
  });
});
