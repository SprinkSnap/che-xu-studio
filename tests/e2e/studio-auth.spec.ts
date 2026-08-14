import { test, expect } from '@playwright/test';

/**
 * Phase 5 auth boundary e2e.
 * Full credentialed login runs only when STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD are set
 * against a local/test Supabase with an active Studio profile.
 */

test.describe('Studio auth boundaries', () => {
  test('unauthenticated /admin redirects to login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: /create account|sign up|free trial/i })).toHaveCount(
      0,
    );
  });

  test('protected section redirects and preserves safe next', async ({ page }) => {
    await page.goto('/admin/clients');
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(page.url()).toContain('next=');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('login rejects open redirects via next parameter', async ({ page }) => {
    await page.goto('/admin/login?next=https://evil.example');
    await expect(page.locator('input[name="next"]')).toHaveValue('/admin');
  });

  test('auth pages are noindex and private no-store', async ({ request }) => {
    const login = await request.get('/admin/login');
    expect(login.ok()).toBeTruthy();
    expect(login.headers()['x-robots-tag']).toContain('noindex');
    expect(login.headers()['cache-control']).toMatch(/private/i);
    expect(login.headers()['cache-control']).toMatch(/no-store/i);

    const forgot = await request.get('/admin/forgot-password');
    expect(forgot.ok()).toBeTruthy();
    expect(forgot.headers()['x-robots-tag']).toContain('noindex');
  });

  test('GET logout does not mutate and redirects to login', async ({ request }) => {
    const response = await request.get('/admin/logout', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toContain('/admin/login');
  });

  test('invalid credentials show a generic error', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('alert')).toContainText(/Unable to sign in/i);
    await expect(page.getByText(/no account exists|password is wrong/i)).toHaveCount(0);
  });

  test('mobile login form is usable', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile viewport only');
    await page.goto('/admin/login');
    const email = page.getByLabel('Email');
    await expect(email).toBeVisible();
    const box = await email.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('credentialed login reaches dashboard when E2E secrets are present', async ({ page }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD for full login e2e');

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await page.goto('/admin/clients');
    await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign Out' }).first().click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
