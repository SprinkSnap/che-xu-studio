const DEFAULT_MAX_BODY = 32_768; // 32 KB

export function jsonError(
  message: string,
  status = 400,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function jsonOk(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function getRequestOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(
  request: Request,
  siteUrl: string,
): boolean {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const allowed = new URL(siteUrl).origin;
  const requestOrigin = getRequestOrigin(request);

  // Same-origin requests without Origin (e.g. some navigations) are allowed when host matches.
  if (!origin && !referer) {
    return requestOrigin === allowed;
  }

  if (origin) {
    try {
      return new URL(origin).origin === allowed;
    } catch {
      return false;
    }
  }

  if (referer) {
    try {
      return new URL(referer).origin === allowed;
    } catch {
      return false;
    }
  }

  return false;
}

export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes = DEFAULT_MAX_BODY,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return { ok: false, response: jsonError('Unsupported content type', 415) };
  }

  const raw = await request.arrayBuffer();
  if (raw.byteLength > maxBytes) {
    return { ok: false, response: jsonError('Request too large', 413) };
  }

  try {
    const data = JSON.parse(new TextDecoder().decode(raw)) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, response: jsonError('Invalid JSON', 400) };
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function redactForLogs(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const sensitive = /email|phone|name|message|password|token|secret|authorization|card|cvv|goal|company/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = sensitive.test(k) ? '[redacted]' : v;
  }
  return out;
}

export function securityHeaders(isProduction: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com"), interest-cohort=()',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://js.stripe.com https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com https://api.stripe.com https://cloudflareinsights.com",
      "frame-src https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "object-src 'none'",
    ].join('; '),
  };

  if (isProduction) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  return headers;
}
