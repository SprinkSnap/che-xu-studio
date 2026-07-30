import type { APIRoute } from 'astro';
import { getSiteUrl } from '../config/site';

export const prerender = true;

const routes = [
  '/',
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
];

export const GET: APIRoute = () => {
  const siteUrl = getSiteUrl(import.meta.env.PUBLIC_SITE_URL);
  const lastmod = new Date().toISOString();

  const urls = routes
    .map(
      (path) => `  <url>
    <loc>${siteUrl}${path === '/' ? '' : path}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
