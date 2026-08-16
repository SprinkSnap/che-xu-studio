import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { studioNavItems } from '../../src/lib/studio/navigation';

/**
 * Studio shell/SEO foundation after Phase 5 auth.
 * Unauthenticated browsers must not reach the dashboard; login remains private/noindex.
 * Credentialed navigation coverage lives in studio-auth.spec.ts (optional secrets).
 */
test.describe('Studio OS foundation', () => {
  test('unauthenticated dashboard redirects to login with private headers', async ({
    request,
    page,
  }) => {
    const response = await request.get('/admin', { maxRedirects: 0 });
    expect([302, 303]).toContain(response.status());
    expect(response.headers().location).toMatch(/\/admin\/login/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive',
    );
  });

  test('login responses send private cache and X-Robots-Tag headers', async ({ request }) => {
    const response = await request.get('/admin/login');
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
    await expect(
      page.getByRole('heading', { name: /invoice link is no longer available/i }),
    ).toBeVisible();
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

  test('robots.txt allows public crawl and disallows private families', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('Allow: /');
    expect(body).not.toMatch(/^Disallow: \/$/m);
    expect(body).toContain('Disallow: /admin/');
    expect(body).toContain('Disallow: /proposal/');
    expect(body).toContain('Disallow: /invoice/');
    expect(body).toContain('Disallow: /api/studio/');
    expect(body).toContain('Sitemap:');
  });

  test('protected nav destinations redirect to login when unauthenticated', async ({
    page,
    request,
  }) => {
    for (const item of studioNavItems) {
      const response = await request.get(item.href, { maxRedirects: 0 });
      expect([302, 303]).toContain(response.status());
      expect(response.headers().location).toMatch(/\/admin\/login/);
      await page.goto(item.href);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });

  test('login page has no serious accessibility violations', async ({ page }) => {
    await page.goto('/admin/login');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
