import type { APIRoute } from 'astro';
import { siteConfig, getSiteUrl } from '../config/site';

export const prerender = true;

/**
 * robots.txt is defense-in-depth for crawlers — not access control.
 * Studio privacy relies on STUDIO_OS_ENABLED (Phase 2) and Auth (Phase 5).
 */
export const GET: APIRoute = () => {
  const siteUrl = getSiteUrl(import.meta.env.PUBLIC_SITE_URL);
  const allow = siteConfig.allowIndexing;

  const privateDisallows = [
    'Disallow: /admin/',
    'Disallow: /proposal/',
    'Disallow: /invoice/',
  ].join('\n');

  const body = allow
    ? `User-agent: *\nAllow: /\n${privateDisallows}\n\nSitemap: ${siteUrl}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n${privateDisallows}\n\nSitemap: ${siteUrl}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
