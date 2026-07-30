import Stripe from 'stripe';
import { getPackageById, type CheckoutMode, type ServicePackage } from '../config/packages';

export type EnvStripeKeys = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PREMIUM_THEME?: string;
  STRIPE_PRICE_CUSTOM_WEBSITE?: string;
  STRIPE_PRICE_CUSTOM_SEO_LAUNCH?: string;
  STRIPE_PRICE_SEO_GROWTH?: string;
  STRIPE_PRICE_WEBSITE_CARE?: string;
  STRIPE_PRICE_PROJECT_DEPOSIT?: string;
};

export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-07-29.dahlia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function resolveStripePriceId(
  pkg: ServicePackage,
  env: EnvStripeKeys,
): string | undefined {
  if (!pkg.stripePriceEnvKey) return undefined;
  const value = env[pkg.stripePriceEnvKey];
  return value && value.trim() ? value.trim() : undefined;
}

export function resolveCheckoutMode(
  pkg: ServicePackage,
  env: EnvStripeKeys,
): CheckoutMode {
  const priceId = resolveStripePriceId(pkg, env);

  if (pkg.billing === 'monthly') {
    return priceId ? 'subscription' : 'quote';
  }

  if (priceId) {
    return 'fixed_price';
  }

  if (env.STRIPE_PRICE_PROJECT_DEPOSIT?.trim()) {
    return 'deposit';
  }

  return 'quote';
}

export interface CheckoutCustomer {
  name: string;
  email: string;
  company?: string;
  existingWebsite?: string;
  projectGoal?: string;
}

export async function createCheckoutSession(options: {
  env: EnvStripeKeys & { PUBLIC_SITE_URL: string };
  planId: string;
  customer: CheckoutCustomer;
  idempotencyKey: string;
}): Promise<
  | { ok: true; url: string; sessionId: string; mode: CheckoutMode }
  | { ok: false; error: string; status: number }
> {
  const { env, planId, customer, idempotencyKey } = options;
  const pkg = getPackageById(planId);
  if (!pkg) {
    return { ok: false, error: 'Invalid plan', status: 400 };
  }

  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, error: 'Checkout is temporarily unavailable', status: 503 };
  }

  const mode = resolveCheckoutMode(pkg, env);
  if (mode === 'quote') {
    return {
      ok: false,
      error: 'This package requires a custom quote before payment',
      status: 422,
    };
  }

  const siteUrl = env.PUBLIC_SITE_URL.replace(/\/$/, '');
  const stripe = getStripe(env.STRIPE_SECRET_KEY);

  let priceId: string | undefined;
  let sessionMode: Stripe.Checkout.SessionCreateParams.Mode = 'payment';

  if (mode === 'subscription') {
    priceId = resolveStripePriceId(pkg, env);
    sessionMode = 'subscription';
  } else if (mode === 'fixed_price') {
    priceId = resolveStripePriceId(pkg, env);
    sessionMode = 'payment';
  } else if (mode === 'deposit') {
    priceId = env.STRIPE_PRICE_PROJECT_DEPOSIT?.trim();
    sessionMode = 'payment';
  }

  if (!priceId) {
    return { ok: false, error: 'Checkout is not configured for this package', status: 503 };
  }

  // Never trust browser-supplied price IDs — only server allowlist mapping above.
  const metadata: Record<string, string> = {
    planId: pkg.id,
    packageName: pkg.name,
    checkoutMode: mode,
    customerName: customer.name.slice(0, 100),
  };
  if (customer.company) metadata.company = customer.company.slice(0, 150);
  if (customer.existingWebsite) metadata.existingWebsite = customer.existingWebsite.slice(0, 200);
  if (customer.projectGoal) metadata.projectGoal = customer.projectGoal.slice(0, 500);

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: sessionMode,
        customer_email: customer.email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/checkout/cancelled?plan=${encodeURIComponent(pkg.id)}`,
        metadata,
        payment_method_types: undefined, // allow Stripe Dashboard / wallets defaults
        allow_promotion_codes: false,
        billing_address_collection: 'auto',
        locale: 'en-CA',
      },
      { idempotencyKey },
    );

    if (!session.url) {
      return { ok: false, error: 'Unable to start checkout', status: 502 };
    }

    return { ok: true, url: session.url, sessionId: session.id, mode };
  } catch (err) {
    console.error('Stripe session create failed', err instanceof Error ? err.message : 'unknown');
    return { ok: false, error: 'Unable to start checkout', status: 502 };
  }
}

export async function retrieveCheckoutSession(
  secretKey: string,
  sessionId: string,
): Promise<Stripe.Checkout.Session | null> {
  try {
    const stripe = getStripe(secretKey);
    return await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
  } catch {
    return null;
  }
}
