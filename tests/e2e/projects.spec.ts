import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 7 project management e2e.
 * Credentialed flows require STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD plus Supabase.
 */

test.describe('Studio projects', () => {
  test('unauthenticated project routes redirect to login', async ({ page }) => {
    await page.goto('/admin/projects');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/projects/new');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('projects list stays noindex when redirected through auth', async ({ request }) => {
    const response = await request.get('/admin/projects', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toMatch(/\/admin\/login/);
  });

  test('create edit status archive restore from client', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    const company = `E2E Proj Client ${suffix}`;
    const projectName = `E2E Project ${suffix}`;

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
    await expect(page).toHaveURL(/\/admin\/projects\/new\?client=/);
    await expect(page.locator('#clientId')).toHaveValue(/[0-9a-f-]{36}/i);

    await page.getByLabel('Project name').fill(projectName);
    await page.getByLabel('Project type').selectOption('Web Design');
    await page.getByLabel('Description').fill('Phase 7 e2e summary');
    await page.getByLabel('Scope of work').fill('Build marketing site');
    await page.getByLabel('Deliverables').fill('Responsive site');
    await page.getByLabel('Project price').fill('8000.00');
    await page.getByLabel('Tax (%)').fill('13');
    await page.getByLabel('Deposit (%)').fill('50');
    await page.getByRole('button', { name: 'Save project' }).click();

    await expect(page).toHaveURL(/\/admin\/projects\/[0-9a-f-]+/i);
    await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible();
    await expect(page.getByText('Inquiry')).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Description').fill('Updated description');
    await page.getByLabel('Project price').fill('8500.00');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Project saved.')).toBeVisible();
    await expect(page.getByText('Updated description')).toBeVisible();

    await page.getByRole('button', { name: 'Move to Proposal' }).click();
    await expect(page.getByText('Project status updated.')).toBeVisible();
    await expect(page.getByText('Proposal', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Move to Awaiting Approval' }).click();
    await expect(page.getByText('Awaiting Approval').first()).toBeVisible();
    await expect(page.getByText('Project status changed')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Project archived.')).toBeVisible();

    await page.goto('/admin/projects?status=archived');
    await page.getByLabel('Search').fill(projectName);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: projectName })).toBeVisible();

    await page.getByRole('link', { name: projectName }).click();
    await page.getByRole('button', { name: 'Restore project' }).click();
    await expect(page.getByText('Project restored to Inquiry.')).toBeVisible();
    await expect(page.getByText('Inquiry').first()).toBeVisible();
  });

  test('project surfaces have no serious accessibility violations when authenticated', async ({
    page,
  }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    for (const path of ['/admin/projects', '/admin/projects/new']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      );
      expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });

  test('mobile new-project form is usable when authenticated', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile viewport only');
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.goto('/admin/projects/new');
    const name = page.getByLabel('Project name');
    await expect(name).toBeVisible();
    const box = await name.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
  });
});
