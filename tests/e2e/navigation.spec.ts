import { test, expect } from '@playwright/test';

const requiredRoutes = [
  '/',
  '/services/web-design/',
  '/services/seo/',
  '/services/website-care/',
  '/pricing/',
  '/work/',
  '/work/northline-home-services/',
  '/about/',
  '/contact/',
  '/checkout/success/',
  '/checkout/cancelled/',
  '/privacy/',
  '/terms/',
  '/refund-cancellation-policy/',
];

test.describe('site navigation', () => {
  test('required routes respond successfully', async ({ page }) => {
    for (const route of requiredRoutes) {
      const response = await page.goto(route);
      expect(response?.ok(), route).toBeTruthy();
      await expect(page.locator('h1').first()).toBeVisible();
    }
  });

  test('desktop primary nav exposes required links and quote CTA', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'desktop nav');
    await page.goto('/pricing/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Services' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Pricing' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Work' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Contact' })).toBeVisible();

    await page.getByRole('banner').getByRole('link', { name: 'Get a Project Quote' }).click();
    await expect(page).toHaveURL(/\/contact\/?\?intent=quote/);
  });

  test('services submenu is keyboard operable and closes on Escape', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'desktop submenu');
    await page.goto('/');
    const services = page.getByRole('navigation', { name: 'Primary' }).getByRole('button', {
      name: 'Services',
    });
    await services.press('Enter');
    await expect(services).toHaveAttribute('aria-expanded', 'true');
    const controls = await services.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    const panel = page.locator(`[id="${controls}"]`);
    await expect(panel.getByRole('link', { name: 'Web Design' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'SEO Strategy' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Website Care' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(services).toHaveAttribute('aria-expanded', 'false');
  });

  test('mobile menu lists every primary page full-screen and restores focus', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'mobile nav only');
    await page.goto('/about/');

    // Crawlable: destination hrefs exist in the document before the menu opens
    // (panel is portaled to body after hydration, so check the page — not only the banner).
    for (const href of [
      '/',
      '/services/web-design',
      '/services/seo',
      '/services/website-care',
      '/pricing',
      '/work',
      '/about',
      '/contact',
    ]) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeAttached();
    }

    const openButton = page.getByRole('button', { name: 'Open menu' });
    await openButton.click();
    const dialog = page.getByRole('dialog', { name: 'Mobile navigation' });
    await expect(dialog).toBeVisible();

    // Full-viewport layer above the sticky header (not clipped inside it).
    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x).toBeLessThanOrEqual(1);
    expect(box!.y).toBeLessThanOrEqual(1);
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(500);

    for (const label of [
      'Home',
      'Web Design',
      'SEO Strategy',
      'Website Care',
      'Pricing',
      'Work',
      'About',
      'Contact',
    ]) {
      await expect(dialog.getByRole('link', { name: label })).toBeVisible();
    }

    // Conversion CTAs belong in the sticky bar / hero, not the page menu.
    await expect(dialog.getByRole('link', { name: 'Find My Best Package' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Get a Project Quote' })).toHaveCount(0);

    await expect(dialog.getByRole('link', { name: 'About' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(openButton).toBeFocused();
  });

  test('footer includes service, studio, and legal links without insights draft', async ({
    page,
  }) => {
    await page.goto('/');
    const footer = page.locator('footer');
    await expect(footer.getByRole('heading', { name: 'Services' })).toBeVisible();
    await expect(footer.getByRole('heading', { name: 'Studio' })).toBeVisible();
    await expect(footer.getByRole('heading', { name: 'Legal' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    await expect(
      footer.getByRole('link', { name: 'Refund & Cancellation Policy' }),
    ).toHaveAttribute('href', '/refund-cancellation-policy');
    await expect(footer.getByRole('link', { name: 'Insights' })).toHaveCount(0);
  });

  test('skip link targets main content', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'desktop keyboard path');
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('no horizontal overflow at 360px on homepage', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
