import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { jsonOk } from '../../lib/security';
import { resolvePublicTurnstileSiteKey } from '../../lib/public-config';

export const prerender = false;

type RuntimeLocals = {
  runtime?: {
    env?: {
      PUBLIC_TURNSTILE_SITE_KEY?: string;
    };
  };
};

/** Public, non-secret config the browser needs after deploy. */
export const GET: APIRoute = ({ locals }) => {
  const runtimeLocals = locals as RuntimeLocals;
  const turnstileSiteKey = resolvePublicTurnstileSiteKey({
    runtime:
      env.PUBLIC_TURNSTILE_SITE_KEY || runtimeLocals.runtime?.env?.PUBLIC_TURNSTILE_SITE_KEY,
    build: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
  });

  return jsonOk(
    {
      turnstileSiteKey,
      configured: Boolean(turnstileSiteKey),
    },
    200,
    {
      'Cache-Control': 'no-store',
    },
  );
};
