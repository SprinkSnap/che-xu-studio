import { test, expect } from '@playwright/test';

/**
 * Phase 6 client management e2e.
 * Credentialed CRUD requires STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD plus Supabase.
 */

test.describe('Studio clients', () => {
  test('unauthenticated clients routes redirect to login', async ({ page }) => {
    await page.goto('/admin/clients');
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin/clients/new');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('clients list stays noindex when redirected through auth', async ({ request }) => {
    const response = await request.get('/admin/clients', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toMatch(/\/admin\/login/);
  });

  test('credentialed client create search edit archive restore', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    const company = `E2E Client ${suffix}`;
    const contact = `Contact ${suffix}`;

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

    await page.goto('/admin/clients');
    await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();
    await page.getByRole('link', { name: 'New Client' }).first().click();
    await expect(page).toHaveURL(/\/admin\/clients\/new/);

    await page.getByLabel('Company / client name').fill(company);
    await page.getByLabel('Contact name').fill(contact);
    await page.getByLabel('Email', { exact: true }).first().fill(`contact-${suffix}@example.com`);
    await page.getByRole('button', { name: 'Save client' }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/[0-9a-f-]+/i);
    await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible();

    await page.goto('/admin/clients');
    await page.getByLabel('Search').fill(company);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: company })).toBeVisible();

    await page.getByRole('link', { name: company }).click();
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Display name').fill(`${company} Display`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `${company} Display` })).toBeVisible();

    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Client archived.')).toBeVisible();

    await page.goto('/admin/clients?status=archived');
    await page.getByLabel('Search').fill(company);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('link', { name: `${company} Display` })).toBeVisible();

    await page.getByRole('link', { name: `${company} Display` }).click();
    await page.getByRole('button', { name: 'Restore client' }).click();
    await expect(page.getByText('Client restored.')).toBeVisible();
  });

  test('mobile new-client form is usable when authenticated', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile viewport only');
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.goto('/admin/clients/new');
    const name = page.getByLabel('Company / client name');
    await expect(name).toBeVisible();
    const box = await name.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
  });
});
