/**
 * Server-only Stripe client for Cloudflare Workers.
 * Do not import this module from client-side React bundles.
 */

import Stripe from 'stripe';
import {
  assertStripeKeyModeConsistency,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isStripeSecretConfigured,
  type StripeEnvSource,
} from './config';

let cachedClient: Stripe | null = null;
let cachedKeyFingerprint: string | null = null;

function keyFingerprint(secretKey: string): string {
  // Never log the key — fingerprint length + prefix only for cache invalidation.
  return `${secretKey.slice(0, 7)}:${secretKey.length}`;
}

export function createStripeClient(env?: StripeEnvSource): Stripe {
  assertStripeKeyModeConsistency(env);
  const secretKey = getStripeSecretKey(env);
  const fingerprint = keyFingerprint(secretKey);
  if (cachedClient && cachedKeyFingerprint === fingerprint) {
    return cachedClient;
  }

  cachedClient = new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
    // Pin to the SDK's bundled API version.
    typescript: true,
  });
  cachedKeyFingerprint = fingerprint;
  return cachedClient;
}

export function tryCreateStripeClient(env?: StripeEnvSource): Stripe | null {
  if (!isStripeSecretConfigured(env)) return null;
  try {
    return createStripeClient(env);
  } catch {
    return null;
  }
}

/**
 * Verify Stripe webhook signature using Workers-compatible async crypto.
 * Pass the raw request body string — never re-serialized JSON.
 */
export async function constructStripeEvent(
  rawBody: string,
  signatureHeader: string | null,
  env?: StripeEnvSource,
): Promise<Stripe.Event> {
  if (!signatureHeader) {
    const error = new Error('Missing Stripe-Signature header');
    error.name = 'StripeSignatureVerificationError';
    throw error;
  }

  const stripe = createStripeClient(env);
  const webhookSecret = getStripeWebhookSecret(env);
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  return stripe.webhooks.constructEventAsync(
    rawBody,
    signatureHeader,
    webhookSecret,
    undefined,
    cryptoProvider,
  );
}

export { Stripe };
