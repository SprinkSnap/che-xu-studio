/**
 * Stripe environment resolution — server-only secrets never PUBLIC_.
 */

export type StripeEnvSource = {
  PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export type ResolvedStripeEnv = {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
};

function trimOrEmpty(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function resolveStripeEnv(fromWorker?: StripeEnvSource): StripeEnvSource {
  const processEnv =
    typeof process !== 'undefined'
      ? {
          PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY,
          STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
          STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        }
      : {};

  return {
    PUBLIC_STRIPE_PUBLISHABLE_KEY:
      fromWorker?.PUBLIC_STRIPE_PUBLISHABLE_KEY ??
      (typeof import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY === 'string'
        ? import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY
        : undefined) ??
      processEnv.PUBLIC_STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY:
      fromWorker?.STRIPE_SECRET_KEY ??
      (typeof import.meta.env.STRIPE_SECRET_KEY === 'string'
        ? import.meta.env.STRIPE_SECRET_KEY
        : undefined) ??
      processEnv.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:
      fromWorker?.STRIPE_WEBHOOK_SECRET ??
      (typeof import.meta.env.STRIPE_WEBHOOK_SECRET === 'string'
        ? import.meta.env.STRIPE_WEBHOOK_SECRET
        : undefined) ??
      processEnv.STRIPE_WEBHOOK_SECRET,
  };
}

export async function readStripeEnvFromRuntime(): Promise<StripeEnvSource> {
  let fromWorker: StripeEnvSource = {};
  try {
    const worker = await import('cloudflare:workers');
    fromWorker = {
      PUBLIC_STRIPE_PUBLISHABLE_KEY: worker.env.PUBLIC_STRIPE_PUBLISHABLE_KEY,
      STRIPE_SECRET_KEY: worker.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: worker.env.STRIPE_WEBHOOK_SECRET,
    };
  } catch {
    // Node / non-worker
  }
  return resolveStripeEnv(fromWorker);
}

export function isStripeSecretConfigured(env?: StripeEnvSource): boolean {
  const resolved = env ?? resolveStripeEnv();
  return trimOrEmpty(resolved.STRIPE_SECRET_KEY).length > 0;
}

export function isStripeWebhookConfigured(env?: StripeEnvSource): boolean {
  const resolved = env ?? resolveStripeEnv();
  return trimOrEmpty(resolved.STRIPE_WEBHOOK_SECRET).length > 0;
}

export function getStripeSecretKey(env?: StripeEnvSource): string {
  const resolved = env ?? resolveStripeEnv();
  const key = trimOrEmpty(resolved.STRIPE_SECRET_KEY);
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
}

export function getStripeWebhookSecret(env?: StripeEnvSource): string {
  const resolved = env ?? resolveStripeEnv();
  const secret = trimOrEmpty(resolved.STRIPE_WEBHOOK_SECRET);
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return secret;
}

export function getStripePublishableKey(env?: StripeEnvSource): string {
  const resolved = env ?? resolveStripeEnv();
  return trimOrEmpty(resolved.PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export type StripeKeyMode = 'test' | 'live' | 'unknown';

export function stripeKeyMode(key: string): StripeKeyMode {
  const value = trimOrEmpty(key);
  if (value.startsWith('sk_test_') || value.startsWith('pk_test_') || value.startsWith('rk_test_')) {
    return 'test';
  }
  if (value.startsWith('sk_live_') || value.startsWith('pk_live_') || value.startsWith('rk_live_')) {
    return 'live';
  }
  return 'unknown';
}

/**
 * Reject mixed test/live Stripe key pairs. Unknown prefixes are allowed only when
 * the counterpart is also unknown (custom/proxy keys) — production should use
 * standard Stripe prefixes.
 */
export function assertStripeKeyModeConsistency(env?: StripeEnvSource): void {
  const resolved = env ?? resolveStripeEnv();
  const secret = trimOrEmpty(resolved.STRIPE_SECRET_KEY);
  const publishable = trimOrEmpty(resolved.PUBLIC_STRIPE_PUBLISHABLE_KEY);
  if (!secret || !publishable) return;

  const secretMode = stripeKeyMode(secret);
  const publishableMode = stripeKeyMode(publishable);
  if (secretMode === 'unknown' || publishableMode === 'unknown') return;
  if (secretMode !== publishableMode) {
    throw new Error(
      `Stripe key mode mismatch: secret is ${secretMode} but publishable is ${publishableMode}`,
    );
  }
}

/** True when a live secret is paired with a non-production site URL (misconfig). */
export function isDangerousStripeLiveLocalhostCombo(options: {
  secretKey?: string;
  siteUrl?: string;
}): boolean {
  const secret = trimOrEmpty(options.secretKey);
  const site = trimOrEmpty(options.siteUrl).toLowerCase();
  if (stripeKeyMode(secret) !== 'live') return false;
  return (
    site.includes('localhost') ||
    site.includes('127.0.0.1') ||
    site.startsWith('http://')
  );
}
