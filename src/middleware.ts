import { defineMiddleware } from 'astro:middleware';
import { securityHeaders } from './lib/security';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const isProduction = import.meta.env.PROD;
  const headers = securityHeaders(isProduction);

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  // APIs and portfolio Work stay uncached so CTA/link updates are visible immediately.
  // Other marketing pages may cache briefly at the edge (short SWR — not multi-hour).
  const path = context.url.pathname;
  const isWork = path === '/work' || path.startsWith('/work/');
  if (path.startsWith('/api/') || isWork) {
    response.headers.set('Cache-Control', 'no-store');
  } else if (response.headers.get('Cache-Control') == null && response.status === 200) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=60, stale-while-revalidate=30',
    );
  }

  return response;
});
