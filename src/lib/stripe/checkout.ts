/**
 * Stripe Checkout Session creation for Invoice capability payments.
 * Amount and currency are always derived server-side from the Invoice balance.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { recordStudioActivity } from '../studio/activity';
import { createStripeClient, Stripe } from './server';
import type { StripeEnvSource } from './config';
import type { CheckoutSessionCreateResult, StripeCheckoutMetadata } from './types';
import {
  assertInvoicePayable,
  type PayableInvoice,
} from '../payments/eligibility';

export class CheckoutError extends Error {
  readonly code: 'unavailable' | 'invalid' | 'config' | 'failed';

  constructor(code: CheckoutError['code'], message: string) {
    super(message);
    this.name = 'CheckoutError';
    this.code = code;
  }
}

function toStripeCurrency(currency: 'CAD' | 'USD'): 'cad' | 'usd' {
  return currency.toLowerCase() as 'cad' | 'usd';
}

function buildMetadata(invoice: PayableInvoice): StripeCheckoutMetadata {
  return {
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    client_id: invoice.client_id,
    project_id: invoice.project_id ?? '',
    invoice_type: invoice.invoice_type,
  };
}

function checkoutLineName(invoice: PayableInvoice): string {
  const typeLabel =
    invoice.invoice_type === 'deposit'
      ? 'Project Deposit'
      : invoice.invoice_type === 'final'
        ? 'Final Payment'
        : 'Invoice';
  return `${invoice.invoice_number} — ${typeLabel}`;
}

/**
 * Idempotency strategy:
 * - Prefer reusing an open Checkout Session for the same invoice + balance.
 * - Otherwise create with Stripe idempotency key:
 *   checkout:{invoice_id}:{balance}:{updated_at}
 * - After cancel/expiry, a new Session is created (updated_at or balance change, or expired row).
 */
export async function createInvoiceCheckoutSession(
  service: StudioSupabaseServiceClient,
  input: {
    invoice: PayableInvoice;
    rawToken: string;
    siteOrigin: string;
    customerEmail?: string | null;
    stripeEnv?: StripeEnvSource;
  },
): Promise<CheckoutSessionCreateResult> {
  assertInvoicePayable(input.invoice);

  const amountMinor = input.invoice.balance_due_minor;
  const currency = input.invoice.currency;
  const stripe = createStripeClient(input.stripeEnv);

  // Reuse recent open session for same amount when still valid.
  const { data: existing } = await service
    .from('invoice_checkout_sessions')
    .select('id, provider_session_id, amount_minor, currency, expires_at, status')
    .eq('invoice_id', input.invoice.id)
    .eq('status', 'open')
    .eq('amount_minor', amountMinor)
    .eq('currency', currency)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.provider_session_id) {
    const expiresAt = existing.expires_at ? new Date(existing.expires_at).getTime() : 0;
    const stillValid = !existing.expires_at || expiresAt > Date.now() + 60_000;
    if (stillValid) {
      try {
        const session = await stripe.checkout.sessions.retrieve(existing.provider_session_id);
        if (session.status === 'open' && session.url) {
          return {
            sessionId: session.id,
            url: session.url,
            amountMinor,
            currency,
            reused: true,
          };
        }
        await service
          .from('invoice_checkout_sessions')
          .update({
            status: session.status === 'complete' ? 'completed' : 'expired',
          })
          .eq('id', existing.id);
      } catch {
        await service
          .from('invoice_checkout_sessions')
          .update({ status: 'expired' })
          .eq('id', existing.id);
      }
    } else {
      await service
        .from('invoice_checkout_sessions')
        .update({ status: 'expired' })
        .eq('id', existing.id);
    }
  }

  const origin = input.siteOrigin.replace(/\/$/, '');
  // Token stays in our success/cancel URLs only — never in Stripe metadata.
  const successUrl = `${origin}/invoice/${encodeURIComponent(input.rawToken)}?payment=processing&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/invoice/${encodeURIComponent(input.rawToken)}?payment=cancelled`;

  const metadata = buildMetadata(input.invoice);
  const idempotencyKey = `checkout:${input.invoice.id}:${amountMinor}:${input.invoice.updated_at}`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Card includes Apple Pay / Google Pay where Stripe + device support them.
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: toStripeCurrency(currency),
              unit_amount: amountMinor,
              product_data: {
                name: checkoutLineName(input.invoice),
                description: `Balance due for ${input.invoice.invoice_number}`,
              },
            },
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: input.invoice.id,
        customer_email: input.customerEmail?.trim() || undefined,
        metadata,
        payment_intent_data: {
          metadata,
        },
        // Issued Invoice already includes tax/discounts — do not recalculate in Stripe.
        // automatic_tax intentionally omitted.
      },
      { idempotencyKey },
    );
  } catch (error) {
    const message =
      error instanceof Stripe.errors.StripeError
        ? 'Unable to start checkout. Please try again.'
        : 'Unable to start checkout. Please try again.';
    throw new CheckoutError('failed', message);
  }

  if (!session.url) {
    throw new CheckoutError('failed', 'Checkout session did not return a URL.');
  }

  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;

  await service.from('invoice_checkout_sessions').upsert(
    {
      invoice_id: input.invoice.id,
      provider_session_id: session.id,
      amount_minor: amountMinor,
      currency,
      status: 'open',
      expires_at: expiresAt,
    },
    { onConflict: 'provider_session_id' },
  );

  await recordStudioActivity(service, {
    actorProfileId: null,
    actorType: 'system',
    action: 'payment.checkout_created',
    clientId: input.invoice.client_id,
    projectId: input.invoice.project_id,
    subjectType: 'invoice',
    subjectId: input.invoice.id,
    metadata: {
      invoice_id: input.invoice.id,
      amount_minor: amountMinor,
      currency,
      provider: 'stripe',
      checkout_session_id: session.id,
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
    amountMinor,
    currency,
    reused: false,
  };
}
