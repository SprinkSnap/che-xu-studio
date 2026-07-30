import { defineMiddleware } from 'astro:middleware';
import { securityHeaders } from './lib/security';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const isProduction = import.meta.env.PROD;
  const headers = securityHeaders(isProduction);

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  // Cache static marketing pages briefly at the edge; APIs remain uncached.
  const path = context.url.pathname;
  if (path.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
  } else if (response.headers.get('Cache-Control') == null && response.status === 200) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    );
  }

  return response;
});
