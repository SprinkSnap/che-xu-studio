/**
 * Auth rate limiting for Studio login / recovery POSTs.
 */

type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

export async function enforceAuthRateLimit(options: {
  request: Request;
  limiter?: RateLimitBinding | null;
  bucket: string;
}): Promise<Response | null> {
  if (!options.limiter) return null;

  const ip =
    options.request.headers.get('cf-connecting-ip') ||
    options.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  try {
    const result = await options.limiter.limit({
      key: `${options.bucket}:${ip}`,
    });
    if (!result.success) {
      return new Response('Too many attempts. Please try again later.', {
        status: 429,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          'Retry-After': '60',
        },
      });
    }
  } catch {
    // Fail open on binding errors so a misconfigured limiter does not lock out the owner.
  }

  return null;
}

export async function readAuthRateLimiter(): Promise<RateLimitBinding | null> {
  try {
    const worker = await import('cloudflare:workers');
    const limiter = (worker.env as { AUTH_RATE_LIMITER?: RateLimitBinding }).AUTH_RATE_LIMITER;
    return limiter ?? null;
  } catch {
    return null;
  }
}
