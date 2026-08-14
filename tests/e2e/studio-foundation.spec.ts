import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { studioNavItems } from '../../src/lib/studio/navigation';

test.describe('Studio OS foundation', () => {
  test('dashboard loads with noindex meta and empty metrics', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive',
    );
    await expect(page.getByText('Outstanding invoices')).toBeVisible();
    await expect(page.getByText('No data yet').first()).toBeVisible();
    await expect(page.getByText('$18,240')).toHaveCount(0);
  });

  test('admin responses send private cache and X-Robots-Tag headers', async ({ request }) => {
    const response = await request.get('/admin');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect(response.headers()['cache-control']).toMatch(/private/i);
    expect(response.headers()['cache-control']).toMatch(/no-store/i);
  });

  test('client document placeholders stay private and empty of business data', async ({
    request,
    page,
  }) => {
    const proposal = await request.get('/proposal/phase2-placeholder-token');
    expect(proposal.ok()).toBeTruthy();
    expect(proposal.headers()['x-robots-tag']).toContain('noindex');
    expect(proposal.headers()['cache-control']).toMatch(/private/i);

    await page.goto('/invoice/phase2-placeholder-token');
    await expect(page.getByRole('heading', { name: 'Invoice unavailable' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive',
    );
  });

  test('public homepage is not forced to private no-store', async ({ request }) => {
    const response = await request.get('/');
    expect(response.ok()).toBeTruthy();
    const cache = response.headers()['cache-control'] || '';
    expect(cache).not.toMatch(/private/i);
  });

  test('sitemap excludes studio routes and still lists marketing paths', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBeTruthy();
    const xml = await response.text();
    expect(xml).toContain('/pricing');
    expect(xml).not.toContain('/admin');
    expect(xml).not.toContain('/proposal');
    expect(xml).not.toContain('/invoice');
  });

  test('robots.txt disallows private families', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('Disallow: /admin/');
    expect(body).toContain('Disallow: /proposal/');
    expect(body).toContain('Disallow: /invoice/');
    expect(body).toContain('Sitemap:');
  });

  test('each Studio navigation destination loads with active state', async ({ page, isMobile }) => {
    for (const item of studioNavItems) {
      await page.goto(item.href);
      await expect(page).toHaveURL(new RegExp(`${item.href}/?$`));
      await expect(page.getByRole('heading', { level: 1, name: item.label })).toBeVisible();

      if (isMobile) {
        await page.getByRole('button', { name: 'Menu' }).click();
        const dialog = page.getByRole('dialog', { name: 'Studio navigation' });
        await expect(dialog).toBeVisible();
        await expect(
          dialog.locator(`a[href="${item.href}"][aria-current="page"]`),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      } else {
        await expect(
          page
            .getByRole('navigation', { name: 'Studio primary' })
            .locator(`a[href="${item.href}"][aria-current="page"]`),
        ).toBeVisible();
      }
    }
  });

  test('mobile studio navigation is keyboard usable', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile drawer only');
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Menu' }).click();
    const dialog = page.getByRole('dialog', { name: 'Studio navigation' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('dashboard has no serious accessibility violations', async ({ page }) => {
    await page.goto('/admin');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
