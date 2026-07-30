import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { nanoid } from 'nanoid';
import type Stripe from 'stripe';
import { getStripe } from '../../../lib/stripe';
import { hasProcessedEvent, markEventProcessed, upsertOrder } from '../../../lib/db';
import { jsonError, jsonOk } from '../../../lib/security';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return jsonError('Webhook not configured', 503);
  }

  if (!env.DB) {
    return jsonError('Database unavailable', 503);
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return jsonError('Missing signature', 400);
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe(env.STRIPE_SECRET_KEY);
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Stripe webhook signature failed', err instanceof Error ? err.message : 'unknown');
    return jsonError('Invalid signature', 400);
  }

  if (await hasProcessedEvent(env.DB, event.id)) {
    return jsonOk({ received: true, duplicate: true });
  }

  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const now = new Date().toISOString();
      await upsertOrder(env.DB, {
        id: nanoid(),
        stripeSessionId: session.id,
        stripeEventId: event.id,
        planId: session.metadata?.planId || 'unknown',
        customerEmail: session.customer_details?.email || session.customer_email || 'unknown',
        customerName:
          session.customer_details?.name || session.metadata?.customerName || 'Customer',
        amountTotal: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        status: 'paid',
        mode: session.metadata?.checkoutMode || session.mode || 'payment',
        createdAt: now,
        updatedAt: now,
      });
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const now = new Date().toISOString();
      await upsertOrder(env.DB, {
        id: nanoid(),
        stripeSessionId: session.id,
        stripeEventId: event.id,
        planId: session.metadata?.planId || 'unknown',
        customerEmail: session.customer_details?.email || session.customer_email || 'unknown',
        customerName:
          session.customer_details?.name || session.metadata?.customerName || 'Customer',
        amountTotal: session.amount_total ?? undefined,
        currency: session.currency ?? undefined,
        status: 'expired',
        mode: session.metadata?.checkoutMode || session.mode || 'payment',
        createdAt: now,
        updatedAt: now,
      });
    }

    await markEventProcessed(env.DB, event.id, event.type, new Date().toISOString());
  } catch (err) {
    console.error('Webhook fulfilment failed', err instanceof Error ? err.message : 'unknown');
    return jsonError('Webhook processing failed', 500);
  }

  return jsonOk({ received: true });
};
