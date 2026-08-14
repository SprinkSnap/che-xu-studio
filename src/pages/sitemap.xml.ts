import type { APIRoute } from 'astro';
import { getSiteUrl } from '../config/site';
import { assertPublicSitemapPath, getPublicSitemapPaths } from '../lib/studio/sitemap';

export const prerender = true;

export const GET: APIRoute = () => {
  const siteUrl = getSiteUrl(import.meta.env.PUBLIC_SITE_URL);
  const routes = getPublicSitemapPaths().filter(assertPublicSitemapPath);

  // lastmod omitted intentionally — build-time "now" timestamps misrepresent freshness.
  // Follow-up: restore lastmod only with real significant modification dates.
  const urls = routes
    .map(
      (path) => `  <url>
    <loc>${siteUrl}${path === '/' ? '' : path}</loc>
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
