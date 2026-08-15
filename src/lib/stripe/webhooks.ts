/**
 * Stripe webhook verification, idempotent event ledger, and reconciliation dispatch.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import type { Json } from '../supabase/database.types';
import { constructStripeEvent, Stripe, tryCreateStripeClient } from './server';
import type { StripeEnvSource } from './config';
import {
  reconcileSucceededStripePayment,
  reconcileSucceededStripeRefund,
  ReconciliationError,
} from '../payments/reconciliation';
import { formatCardPaymentMethod } from '../payments/validation';
import { recordStudioActivity } from '../studio/activity';

export const STRIPE_PROVIDER = 'stripe';

/** Events we actively reconcile. Others are recorded and ignored. */
export const SUPPORTED_STRIPE_EVENT_TYPES = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.payment_failed',
  'charge.refunded',
  'refund.updated',
] as const;

export type SupportedStripeEventType = (typeof SUPPORTED_STRIPE_EVENT_TYPES)[number];

export class WebhookError extends Error {
  readonly httpStatus: number;
  readonly code: 'signature' | 'invalid' | 'failed';

  constructor(code: WebhookError['code'], message: string, httpStatus: number) {
    super(message);
    this.name = 'WebhookError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function safeEventMetadata(event: Stripe.Event): Record<string, Json> {
  return {
    event_type: event.type,
    livemode: event.livemode,
    created: event.created,
    object: typeof event.data?.object === 'object' && event.data.object && 'object' in event.data.object
      ? String((event.data.object as { object?: string }).object ?? '')
      : '',
  };
}

async function registerWebhookEvent(
  service: StudioSupabaseServiceClient,
  event: Stripe.Event,
): Promise<{ id: string; duplicate: boolean; status: string }> {
  const insert = await service
    .from('webhook_events')
    .insert({
      provider: STRIPE_PROVIDER,
      provider_event_id: event.id,
      event_type: event.type,
      processing_status: 'received',
      payload_metadata: safeEventMetadata(event),
    })
    .select('id, processing_status')
    .single();

  if (!insert.error && insert.data) {
    return {
      id: insert.data.id,
      duplicate: false,
      status: insert.data.processing_status,
    };
  }

  // Unique violation → already seen
  const existing = await service
    .from('webhook_events')
    .select('id, processing_status')
    .eq('provider', STRIPE_PROVIDER)
    .eq('provider_event_id', event.id)
    .maybeSingle();

  if (existing.data) {
    return {
      id: existing.data.id,
      duplicate: true,
      status: existing.data.processing_status,
    };
  }

  throw new WebhookError('failed', 'Unable to register webhook event.', 500);
}

async function markWebhookProcessed(
  service: StudioSupabaseServiceClient,
  eventRowId: string,
): Promise<void> {
  await service
    .from('webhook_events')
    .update({
      processing_status: 'processed',
      processed_at: new Date().toISOString(),
      failure_message: null,
    })
    .eq('id', eventRowId);
}

async function markWebhookFailed(
  service: StudioSupabaseServiceClient,
  eventRowId: string,
  message: string,
): Promise<void> {
  await service
    .from('webhook_events')
    .update({
      processing_status: 'failed',
      failure_message: message.slice(0, 500),
    })
    .eq('id', eventRowId);
}

async function markWebhookIgnored(
  service: StudioSupabaseServiceClient,
  eventRowId: string,
): Promise<void> {
  await service
    .from('webhook_events')
    .update({
      processing_status: 'ignored',
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventRowId);
}

function currencyFromStripe(value: string | null | undefined): 'CAD' | 'USD' | null {
  const upper = (value || '').toUpperCase();
  if (upper === 'CAD' || upper === 'USD') return upper;
  return null;
}

async function resolvePaymentMethodDescriptor(
  stripe: Stripe,
  paymentIntentId: string | null | undefined,
): Promise<string | null> {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method'],
    });
    const pm = pi.payment_method;
    if (pm && typeof pm !== 'string' && pm.card) {
      return formatCardPaymentMethod({
        brand: pm.card.brand,
        last4: pm.card.last4,
        walletType: pm.card.wallet?.type ?? null,
      });
    }
  } catch {
    // Best-effort descriptor only
  }
  return 'Card';
}

async function handleCheckoutSessionPaid(
  service: StudioSupabaseServiceClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  // Do not treat incomplete / unpaid sessions as success.
  const paymentStatus = session.payment_status;
  if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') {
    return;
  }

  const invoiceId =
    session.metadata?.invoice_id || session.client_reference_id || null;
  const clientId = session.metadata?.client_id || null;
  if (!invoiceId || !clientId) {
    throw new ReconciliationError('invalid', 'Checkout session missing invoice correlation.');
  }

  const currency = currencyFromStripe(session.currency);
  const amountMinor = session.amount_total;
  if (!currency || amountMinor == null || amountMinor <= 0) {
    throw new ReconciliationError('invalid', 'Checkout session missing amount/currency.');
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Prefer PaymentIntent id as durable provider_payment_id; fall back to session id.
  const providerPaymentId = paymentIntentId || `cs_fallback_${session.id}`;
  const paymentMethod = await resolvePaymentMethodDescriptor(stripe, paymentIntentId);

  await reconcileSucceededStripePayment(service, {
    invoiceId,
    clientId,
    amountMinor,
    currency,
    providerPaymentId,
    providerCheckoutSessionId: session.id,
    paymentMethod,
    paidAt: new Date().toISOString(),
    metadata: {
      stripe_session_id: session.id,
      payment_intent_id: paymentIntentId,
    },
  });
}

async function handleCheckoutAsyncFailed(
  service: StudioSupabaseServiceClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const invoiceId = session.metadata?.invoice_id || session.client_reference_id || null;
  const clientId = session.metadata?.client_id || null;
  if (!invoiceId) return;

  await service
    .from('invoice_checkout_sessions')
    .update({ status: 'expired' })
    .eq('provider_session_id', session.id)
    .eq('status', 'open');

  await recordStudioActivity(service, {
    actorProfileId: null,
    actorType: 'stripe',
    action: 'payment.failed',
    clientId,
    subjectType: 'invoice',
    subjectId: invoiceId,
    metadata: {
      invoice_id: invoiceId,
      provider: 'stripe',
      checkout_session_id: session.id,
      reason: 'async_payment_failed',
    },
  });
}

async function handlePaymentIntentFailed(
  service: StudioSupabaseServiceClient,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const invoiceId = pi.metadata?.invoice_id || null;
  const clientId = pi.metadata?.client_id || null;
  if (!invoiceId) return;

  await recordStudioActivity(service, {
    actorProfileId: null,
    actorType: 'stripe',
    action: 'payment.failed',
    clientId,
    subjectType: 'invoice',
    subjectId: invoiceId,
    metadata: {
      invoice_id: invoiceId,
      provider: 'stripe',
      amount_minor: pi.amount,
      currency: (pi.currency || '').toUpperCase(),
    },
  });
}

function paymentIdFromCharge(charge: Stripe.Charge): string | null {
  const pi = charge.payment_intent;
  if (typeof pi === 'string') return pi;
  if (pi && typeof pi === 'object' && 'id' in pi) return pi.id;
  return null;
}

async function handleChargeRefunded(
  service: StudioSupabaseServiceClient,
  charge: Stripe.Charge,
): Promise<void> {
  const providerPaymentId = paymentIdFromCharge(charge);
  if (!providerPaymentId) {
    throw new ReconciliationError('invalid', 'Refund charge missing payment_intent.');
  }

  const currency = currencyFromStripe(charge.currency);
  if (!currency) {
    throw new ReconciliationError('mismatch', 'Unsupported refund currency.');
  }

  // Prefer individual refund objects on the charge for idempotent rows.
  const refunds = charge.refunds?.data ?? [];
  if (refunds.length === 0) {
    // Aggregate-only fallback — use charge.amount_refunded as a single synthetic id once.
    if (!charge.amount_refunded || charge.amount_refunded <= 0) return;
    await reconcileSucceededStripeRefund(service, {
      providerRefundId: `charge_refund_total_${charge.id}`,
      providerPaymentId,
      amountMinor: charge.amount_refunded,
      currency,
      refundedAt: new Date().toISOString(),
      reason: charge.refunded ? 'charge.refunded' : null,
    });
    return;
  }

  for (const refund of refunds) {
    if (refund.status && refund.status !== 'succeeded') continue;
    if (!refund.amount || refund.amount <= 0) continue;
    await reconcileSucceededStripeRefund(service, {
      providerRefundId: refund.id,
      providerPaymentId,
      amountMinor: refund.amount,
      currency: currencyFromStripe(refund.currency) ?? currency,
      refundedAt: refund.created
        ? new Date(refund.created * 1000).toISOString()
        : new Date().toISOString(),
      reason: refund.reason ?? null,
    });
  }
}

async function handleRefundUpdated(
  service: StudioSupabaseServiceClient,
  refund: Stripe.Refund,
): Promise<void> {
  if (refund.status !== 'succeeded') return;
  const providerPaymentId =
    typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent?.id ?? null;
  if (!providerPaymentId || !refund.amount) return;

  const currency = currencyFromStripe(refund.currency);
  if (!currency) return;

  await reconcileSucceededStripeRefund(service, {
    providerRefundId: refund.id,
    providerPaymentId,
    amountMinor: refund.amount,
    currency,
    refundedAt: refund.created
      ? new Date(refund.created * 1000).toISOString()
      : new Date().toISOString(),
    reason: refund.reason ?? null,
  });
}

async function processStripeEvent(
  service: StudioSupabaseServiceClient,
  stripe: Stripe,
  event: Stripe.Event,
): Promise<'processed' | 'ignored'> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      await handleCheckoutSessionPaid(
        service,
        stripe,
        event.data.object as Stripe.Checkout.Session,
      );
      return 'processed';
    }
    case 'checkout.session.async_payment_failed': {
      await handleCheckoutAsyncFailed(service, event.data.object as Stripe.Checkout.Session);
      return 'processed';
    }
    case 'payment_intent.payment_failed': {
      await handlePaymentIntentFailed(service, event.data.object as Stripe.PaymentIntent);
      return 'processed';
    }
    case 'charge.refunded': {
      await handleChargeRefunded(service, event.data.object as Stripe.Charge);
      return 'processed';
    }
    case 'refund.updated': {
      await handleRefundUpdated(service, event.data.object as Stripe.Refund);
      return 'processed';
    }
    default:
      return 'ignored';
  }
}

/**
 * Full webhook pipeline: verify → register (idempotent) → process → mark status.
 * Duplicate already-processed events return success without re-applying money.
 * Failed events remain failed so Stripe can retry; retries are idempotent.
 */
export async function handleStripeWebhookRequest(
  service: StudioSupabaseServiceClient,
  request: Request,
  stripeEnv?: StripeEnvSource,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = await constructStripeEvent(rawBody, signature, stripeEnv);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const registered = await registerWebhookEvent(service, event);

  if (registered.duplicate && registered.status === 'processed') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (registered.duplicate && registered.status === 'ignored') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Mark processing (best-effort)
  await service
    .from('webhook_events')
    .update({ processing_status: 'processing' })
    .eq('id', registered.id)
    .in('processing_status', ['received', 'failed', 'processing']);

  const stripe = tryCreateStripeClient(stripeEnv);
  if (!stripe) {
    await markWebhookFailed(service, registered.id, 'Stripe client unavailable');
    return new Response(JSON.stringify({ error: 'Configuration error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const outcome = await processStripeEvent(service, stripe, event);
    if (outcome === 'ignored') {
      await markWebhookIgnored(service, registered.id);
    } else {
      await markWebhookProcessed(service, registered.id);
    }
  } catch (error) {
    const message =
      error instanceof ReconciliationError || error instanceof Error
        ? error.message
        : 'Processing failed';
    await markWebhookFailed(service, registered.id, message);
    // Return 500 so Stripe retries — processing is idempotent.
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
