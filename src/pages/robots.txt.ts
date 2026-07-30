import type { APIRoute } from 'astro';
import { siteConfig, getSiteUrl } from '../config/site';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteUrl = getSiteUrl(import.meta.env.PUBLIC_SITE_URL);
  const allow = siteConfig.allowIndexing;

  const body = allow
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
