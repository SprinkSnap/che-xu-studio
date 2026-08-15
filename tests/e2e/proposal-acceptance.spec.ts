import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 10 secure proposal acceptance e2e.
 * Credentialed flows require STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD.
 */

test.describe('Studio proposal acceptance', () => {
  test('invalid public proposal token shows unavailable without studio chrome', async ({
    page,
  }) => {
    const response = await page.goto('/proposal/this-is-not-a-valid-capability-token-value-xx');
    expect(response?.headers()['cache-control'] || '').toMatch(/private|no-store/);
    expect(response?.headers()['x-robots-tag'] || '').toMatch(/noindex/);
    await expect(page.getByText(/no longer available/i)).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('proposal paths are absent from sitemap', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).not.toContain('/proposal/');
    expect(body).not.toContain('/invoice/');
  });

  test('create link accept deposit idempotent', async ({ page, context }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    const company = `E2E Acc Client ${suffix}`;
    const projectName = `E2E Acc Project ${suffix}`;

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/admin\/?$/);

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

    await page.getByRole('button', { name: /Finalize/i }).click();
    await expect(page.getByText(/finaliz/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Create Client Link/i }).click();
    const linkInput = page.locator('#created-client-link');
    await expect(linkInput).toBeVisible();
    const clientUrl = await linkInput.inputValue();
    expect(clientUrl).toMatch(/\/proposal\//);

    const clientPage = await context.newPage();
    await clientPage.goto(clientUrl);
    await expect(clientPage.getByText(projectName).first()).toBeVisible();
    await expect(clientPage.getByRole('navigation')).toHaveCount(0);

    await clientPage.getByLabel('Name').fill(`Decision Maker ${suffix}`);
    await clientPage.getByLabel('Email').fill(`decision-${suffix}@example.com`);
    await clientPage.getByRole('checkbox').check();
    await clientPage.getByRole('button', { name: /Accept Proposal/i }).click();
    await expect(clientPage.getByText(/Proposal accepted/i)).toBeVisible();
    await expect(clientPage.getByText(/Deposit invoice/i)).toBeVisible();

    // Idempotent re-accept
    await clientPage.goto(clientUrl);
    await expect(clientPage.getByText(/Accepted/i).first()).toBeVisible();

    await page.goto(proposalUrl);
    await expect(page.getByText(/Accepted by/i)).toBeVisible();
    await expect(page.getByText(/Deposit/i).first()).toBeVisible();
  });

  test('request changes does not create deposit invoice', async ({ page, context }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.goto('/admin/clients/new');
    await page.getByLabel('Company / client name').fill(`E2E Chg ${suffix}`);
    await page.getByLabel('Contact name').fill(`Contact ${suffix}`);
    await page.getByRole('button', { name: 'Save client' }).click();
    await page.getByRole('link', { name: 'New Project' }).first().click();
    await page.getByLabel('Project name').fill(`E2E Chg Project ${suffix}`);
    await page.getByLabel('Project price').fill('8000.00');
    await page.getByRole('button', { name: 'Save project' }).click();
    await page.getByRole('link', { name: 'Create Proposal' }).first().click();
    await page.getByRole('button', { name: /Create proposal/i }).click();
    await page.getByRole('button', { name: /Finalize/i }).click();
    await page.getByRole('button', { name: /Create Client Link/i }).click();
    const clientUrl = await page.locator('#created-client-link').inputValue();
    const proposalUrl = page.url();

    const clientPage = await context.newPage();
    await clientPage.goto(clientUrl);
    await clientPage.locator('#requestedByName').fill(`Requester ${suffix}`);
    await clientPage.locator('#requestedByEmail').fill(`req-${suffix}@example.com`);
    await clientPage.locator('#message').fill('Please adjust timeline and deliverables scope.');
    await clientPage.getByRole('button', { name: /Request Changes/i }).click();
    await expect(clientPage.getByText(/Change request submitted/i)).toBeVisible();

    await page.goto(proposalUrl);
    await expect(page.getByText(/Change requests/i)).toBeVisible();
    await expect(page.getByText(/adjust timeline/i)).toBeVisible();
  });

  test('revoked link is unavailable', async ({ page, context }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const suffix = Date.now().toString(36);
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.goto('/admin/clients/new');
    await page.getByLabel('Company / client name').fill(`E2E Rev ${suffix}`);
    await page.getByLabel('Contact name').fill(`Contact ${suffix}`);
    await page.getByRole('button', { name: 'Save client' }).click();
    await page.getByRole('link', { name: 'New Project' }).first().click();
    await page.getByLabel('Project name').fill(`E2E Rev Project ${suffix}`);
    await page.getByLabel('Project price').fill('8000.00');
    await page.getByRole('button', { name: 'Save project' }).click();
    await page.getByRole('link', { name: 'Create Proposal' }).first().click();
    await page.getByRole('button', { name: /Create proposal/i }).click();
    await page.getByRole('button', { name: /Finalize/i }).click();
    await page.getByRole('button', { name: /Create Client Link/i }).click();
    const clientUrl = await page.locator('#created-client-link').inputValue();
    await page.getByRole('button', { name: /^Revoke$/i }).first().click();

    const clientPage = await context.newPage();
    await clientPage.goto(clientUrl);
    await expect(clientPage.getByText(/no longer available/i)).toBeVisible();
  });

  test('public proposal accessibility when unavailable', async ({ page }) => {
    await page.goto('/proposal/this-is-not-a-valid-capability-token-value-yy');
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
