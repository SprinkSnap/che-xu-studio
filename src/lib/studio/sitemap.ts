import { siteConfig } from '../../config/site';

/**
 * Explicit allowlist of public marketing paths for sitemap.xml.
 * Private Studio surfaces (/admin, /proposal, /invoice, /api) must never appear here.
 */
export const PUBLIC_SITEMAP_STATIC_ROUTES = [
  '/',
  '/services/branding',
  '/services/web-design',
  '/services/seo',
  '/services/website-care',
  '/pricing',
  '/about',
  '/work',
  '/contact',
  '/insights',
  '/privacy',
  '/terms',
  '/refund-cancellation-policy',
] as const;

export function getPublicSitemapPaths(): string[] {
  const projectRoutes = siteConfig.projects.map((project) => `/work/${project.slug}`);
  return [...PUBLIC_SITEMAP_STATIC_ROUTES, ...projectRoutes];
}

/** Defense-in-depth: reject any accidental private path before sitemap serialization. */
export function assertPublicSitemapPath(path: string): boolean {
  if (path.startsWith('/admin') || path.startsWith('/proposal') || path.startsWith('/invoice')) {
    return false;
  }
  if (path.startsWith('/api')) return false;
  return true;
}

/**
 * Follow-up (documented): sitemap lastmod currently omitted rather than emitting
 * build-time "now" timestamps that misrepresent content freshness.
 * Restore lastmod only when real significant modification dates are available.
 */
