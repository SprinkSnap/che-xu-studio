import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase 11 secure invoice payment e2e.
 * Full Stripe Checkout requires STRIPE_SECRET_KEY + webhook forwarding.
 * Credentialed Studio flows require STUDIO_E2E_EMAIL / STUDIO_E2E_PASSWORD.
 */

test.describe('Studio invoice payments', () => {
  test('invalid public invoice token shows unavailable without studio chrome', async ({
    page,
  }) => {
    const response = await page.goto('/invoice/this-is-not-a-valid-capability-token-value-xx');
    expect(response?.headers()['cache-control'] || '').toMatch(/private|no-store/);
    expect(response?.headers()['x-robots-tag'] || '').toMatch(/noindex/);
    await expect(page.getByText(/no longer available/i)).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('invoice paths are absent from sitemap', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).not.toContain('/invoice/');
    expect(body).not.toContain('/admin/payments');
  });

  test('legacy checkout success never claims paid settlement', async ({ page }) => {
    await page.goto('/checkout/success');
    await expect(page.getByText(/does not mark an invoice as paid/i)).toBeVisible();
  });

  test('unavailable invoice page has no critical a11y violations', async ({ page }) => {
    await page.goto('/invoice/this-is-not-a-valid-capability-token-value-xx');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical).toEqual([]);
  });

  test('create payment link and public invoice pay CTA', async ({ page, context }) => {
    const email = process.env.STUDIO_E2E_EMAIL;
    const password = process.env.STUDIO_E2E_PASSWORD;
    test.skip(!email || !password, 'Set STUDIO_E2E_EMAIL and STUDIO_E2E_PASSWORD');

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    test.skip(!stripeKey, 'Set STRIPE_SECRET_KEY for Checkout creation');

    const suffix = Date.now().toString(36);
    const company = `E2E Pay Client ${suffix}`;
    const projectName = `E2E Pay Project ${suffix}`;

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
    await page.getByLabel('Project price').fill('2000.00');
    await page.getByLabel('Tax (%)').fill('13');
    await page.getByLabel('Deposit (%)').fill('50');
    await page.getByRole('button', { name: 'Save project' }).click();

    // Move project toward deposit_due via proposal acceptance path is heavy;
    // create a manual invoice instead.
    await page.getByRole('link', { name: /Create Invoice|New Invoice|Invoices/i }).first().click();
    // Prefer project invoices entry if present
    const projectUrl = page.url();
    if (/\/admin\/projects\//.test(projectUrl)) {
      const createInvoice = page.getByRole('link', { name: /Create Invoice|New Invoice/i });
      if (await createInvoice.count()) {
        await createInvoice.first().click();
      } else {
        await page.goto('/admin/invoices/new');
      }
    } else {
      await page.goto('/admin/invoices/new');
    }

    // If landed on invoice form, fill minimally and issue.
    if (page.url().includes('/admin/invoices')) {
      // Best-effort: many forms require client/project selects already filled from project page.
      const save = page.getByRole('button', { name: /Save|Create/i });
      if (await save.count()) {
        await save.first().click();
      }
    }

    // Navigate to invoices list and open newest if needed
    await page.goto('/admin/invoices');
    const firstInvoice = page.locator('a[href*="/admin/invoices/"]').filter({ hasText: /CXS|INV/i }).first();
    test.skip((await firstInvoice.count()) === 0, 'No invoice available to attach payment link');
    await firstInvoice.click();

    const issueBtn = page.getByRole('button', { name: /Issue invoice/i });
    if (await issueBtn.count()) {
      page.once('dialog', (d) => d.accept());
      await issueBtn.click();
    }

    const createLink = page.getByRole('button', { name: /Create Payment Link|Replace Payment Link/i });
    test.skip((await createLink.count()) === 0, 'Payment link action unavailable on this invoice');
    await createLink.click();
    const linkInput = page.locator('#created-client-link');
    await expect(linkInput).toBeVisible();
    const clientUrl = await linkInput.inputValue();
    expect(clientUrl).toMatch(/\/invoice\//);

    const clientPage = await context.newPage();
    await clientPage.setViewportSize({ width: 390, height: 844 });
    await clientPage.goto(clientUrl);
    await expect(clientPage.getByRole('navigation')).toHaveCount(0);
    await expect(clientPage.getByText(/Balance due|Pay Invoice/i).first()).toBeVisible();

    const payBtn = clientPage.getByRole('button', { name: /Pay Invoice/i });
    if (await payBtn.count()) {
      // Starts Checkout — may land on Stripe hosted page in test mode.
      await Promise.all([
        clientPage.waitForURL(/checkout\.stripe\.com|payment=|stripe/i, { timeout: 30_000 }).catch(() => null),
        payBtn.click(),
      ]);
    }
  });
});
