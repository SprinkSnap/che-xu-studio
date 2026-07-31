import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonOk } from '../../lib/security';
import { resolvePublicTurnstileSiteKey } from '../../lib/public-config';

export const prerender = false;

/** Public, non-secret config the browser needs after deploy. */
export const GET: APIRoute = () => {
  const turnstileSiteKey = resolvePublicTurnstileSiteKey({
    runtime: env.PUBLIC_TURNSTILE_SITE_KEY,
    build: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
  });

  return jsonOk(
    { turnstileSiteKey },
    200,
    {
      'Cache-Control': 'public, max-age=60',
    },
  );
};
