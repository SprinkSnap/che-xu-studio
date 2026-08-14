import { test, expect } from '@playwright/test';

test.describe('Supabase Phase 3 isolation', () => {
  test('public homepage renders without requiring Supabase env', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('banner').getByRole('link', { name: /Che Xu Studio home/i }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('studio health endpoint never returns secret material', async ({ request }) => {
    const response = await request.get('/api/studio/health');
    // May be 200 (Studio enabled in preview) or 404 (gated).
    if (response.status() === 404) {
      expect(response.status()).toBe(404);
      return;
    }
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toMatch(/private|no-store/i);
    const body = await response.json();
    expect(body.services?.supabase).toMatch(/configured|unconfigured/);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/sb_secret/i);
    expect(raw).not.toContain('SUPABASE_SECRET_KEY');
    expect(raw).not.toMatch(/eyJ/); // JWT-looking material
  });

  test('admin shell still loads when Supabase is unconfigured', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow, noarchive',
    );
  });
});
