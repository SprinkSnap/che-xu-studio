import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('critical marketing flows', () => {
  test('homepage renders brand, hero, and package finder', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner').getByRole('link', { name: /Che Xu Studio home/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Websites that win more qualified enquiries',
    );
    await expect(page.getByRole('heading', { name: /Which service fits your goal/i })).toBeVisible();
  });

  test('pricing page shows five packages without requiring horizontal scroll on cards', async ({
    page,
  }) => {
    await page.goto('/pricing/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-package-id]')).toHaveCount(5);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('package finder completes a recommendation', async ({ page }) => {
    await page.goto('/#package-finder');
    const finder = page.locator('#package-finder');
    await finder.getByRole('button', { name: 'Start the finder' }).click();
    await finder.getByRole('button', { name: /Ongoing website care/i }).click();
    await expect(
      finder.getByRole('heading', { name: 'Website Care & Maintenance' }),
    ).toBeVisible();
    await expect(finder.getByRole('link', { name: 'Compare all packages' })).toBeVisible();
  });

  test('pricing CTAs link to contact quote flow', async ({ page }) => {
    await page.goto('/pricing/');
    const quoteLink = page.locator('[data-package-id="website-care"] a[href*="/contact"]').first();
    await expect(quoteLink).toBeVisible();
    await expect(quoteLink).toHaveAttribute('href', /plan=website-care/);
    await expect(quoteLink).toHaveAttribute('href', /intent=quote/);
  });

  test('contact page has accessible form labels', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Message')).toBeVisible();
  });

  test('mobile nav opens and closes with keyboard', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile nav only');
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Mobile navigation' })).toHaveCount(0);
  });

  test('homepage has no serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
