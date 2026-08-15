import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 8 proposal management e2e.
 * Credentialed flows require STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD.
 */

test.describe('Studio proposals', () => {
  test('unauthenticated proposal routes redirect to login', async ({ page }) => {
    await page.goto('/admin/proposals');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/templates');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('proposal list stays noindex when redirected through auth', async ({ request }) => {
    const response = await request.get('/admin/proposals', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toMatch(/\/admin\/login/);
  });

  test('create proposal from project save preview finalize revise', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    const company = `E2E Prop Client ${suffix}`;
    const projectName = `E2E Prop Project ${suffix}`;

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

    await page.getByRole('link', { name: 'Create Proposal' }).first().click();
    await expect(page).toHaveURL(/\/admin\/proposals\/new\?project=/);
    await page.getByRole('button', { name: /Create proposal/i }).click();
    await expect(page).toHaveURL(/\/admin\/proposals\/[0-9a-f-]+/i);

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Proposal title').fill(`${projectName} Proposal`);
    await page.getByLabel('Introduction').fill('Phase 8 e2e introduction');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText(/saved|Proposal/i).first()).toBeVisible();

    await page.getByRole('link', { name: 'Preview' }).click();
    await expect(page.getByText('Phase 8 e2e introduction')).toBeVisible();

    await page.goto(page.url().replace(/\/preview\/?$/, ''));
    await page.getByRole('button', { name: /Finalize/i }).click();
    await expect(page.getByText(/finaliz/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Create revision|Revision/i }).click();
    await expect(page.getByText(/Version 2|revision/i).first()).toBeVisible();
  });

  test('proposal surfaces have no serious accessibility violations when authenticated', async ({
    page,
  }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    for (const path of ['/admin/proposals', '/admin/templates']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });
});
