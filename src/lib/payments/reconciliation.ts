/**
 * Stripe payment reconciliation via SECURITY DEFINER RPCs + project transitions.
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import type { Json } from '../supabase/database.types';
import { recordStudioActivity } from '../studio/activity';
import {
  applyDepositPaidProjectTransition,
  applyFinalPaidProjectTransition,
} from './project-activation';
import type { ReconcilePaymentResult } from './types';

export class ReconciliationError extends Error {
  readonly code: 'invalid' | 'mismatch' | 'failed' | 'anomaly';

  constructor(code: ReconciliationError['code'], message: string) {
    super(message);
    this.name = 'ReconciliationError';
    this.code = code;
  }
}

type RpcPaymentResult = {
  payment_id: string;
  payment_created: boolean;
  invoice_id: string;
  invoice_status: string;
  invoice_type: string;
  project_id: string | null;
  client_id: string;
  amount_paid_minor: number;
  balance_due_minor: number;
  total_minor: number;
  paid_at: string | null;
  overpayment_minor: number;
  anomaly: string | null;
};

function mapRpcResult(raw: RpcPaymentResult): ReconcilePaymentResult {
  return {
    paymentId: raw.payment_id,
    paymentCreated: raw.payment_created,
    invoiceId: raw.invoice_id,
    invoiceStatus: raw.invoice_status,
    invoiceType: raw.invoice_type,
    projectId: raw.project_id,
    clientId: raw.client_id,
    amountPaidMinor: raw.amount_paid_minor,
    balanceDueMinor: raw.balance_due_minor,
    totalMinor: raw.total_minor,
    paidAt: raw.paid_at,
    overpaymentMinor: raw.overpayment_minor ?? 0,
    anomaly: raw.anomaly,
  };
}

export async function reconcileSucceededStripePayment(
  service: StudioSupabaseServiceClient,
  input: {
    invoiceId: string;
    clientId: string;
    amountMinor: number;
    currency: 'CAD' | 'USD';
    providerPaymentId: string;
    providerCheckoutSessionId?: string | null;
    paymentMethod?: string | null;
    paidAt?: string | null;
    metadata?: Record<string, Json | undefined>;
  },
): Promise<ReconcilePaymentResult> {
  // Pre-validate invoice correlation before RPC.
  const { data: invoice, error: invoiceError } = await service
    .from('invoices')
    .select('id, client_id, currency, status, total_minor, balance_due_minor')
    .eq('id', input.invoiceId)
    .maybeSingle();

  if (invoiceError || !invoice) {
    throw new ReconciliationError('invalid', 'Invoice not found for payment.');
  }
  if (invoice.client_id !== input.clientId) {
    throw new ReconciliationError('mismatch', 'Invoice client mismatch.');
  }
  if (invoice.currency !== input.currency) {
    throw new ReconciliationError('mismatch', 'Payment currency does not match invoice.');
  }
  if (invoice.status === 'void' || invoice.status === 'draft') {
    throw new ReconciliationError('invalid', 'Invoice cannot accept payments.');
  }

  const metadata: Record<string, Json> = {};
  if (input.metadata) {
    for (const [key, value] of Object.entries(input.metadata)) {
      if (value !== undefined) metadata[key] = value;
    }
  }

  const { data, error } = await service.rpc('apply_succeeded_stripe_payment', {
    p_invoice_id: input.invoiceId,
    p_client_id: input.clientId,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_provider_payment_id: input.providerPaymentId,
    p_provider_checkout_session_id: input.providerCheckoutSessionId ?? null,
    p_payment_method: input.paymentMethod ?? null,
    p_paid_at: input.paidAt ?? new Date().toISOString(),
    p_metadata: metadata,
  });

  if (error || !data) {
    throw new ReconciliationError('failed', 'Unable to reconcile payment.');
  }

  const result = mapRpcResult(data as RpcPaymentResult);

  if (result.paymentCreated) {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'payment.succeeded',
      clientId: result.clientId,
      projectId: result.projectId,
      subjectType: 'payment',
      subjectId: result.paymentId,
      metadata: {
        invoice_id: result.invoiceId,
        amount_minor: input.amountMinor,
        currency: input.currency,
        provider: 'stripe',
      },
    });
  }

  if (result.invoiceStatus === 'partially_paid') {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'invoice.partially_paid',
      clientId: result.clientId,
      projectId: result.projectId,
      subjectType: 'invoice',
      subjectId: result.invoiceId,
      metadata: {
        invoice_id: result.invoiceId,
        amount_paid_minor: result.amountPaidMinor,
        balance_due_minor: result.balanceDueMinor,
        currency: input.currency,
        provider: 'stripe',
      },
    });
  }

  let depositActivated = false;
  let finalCompleted = false;

  if (result.invoiceStatus === 'paid') {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'invoice.paid',
      clientId: result.clientId,
      projectId: result.projectId,
      subjectType: 'invoice',
      subjectId: result.invoiceId,
      metadata: {
        invoice_id: result.invoiceId,
        amount_paid_minor: result.amountPaidMinor,
        currency: input.currency,
        provider: 'stripe',
      },
    });

    if (result.projectId) {
      if (result.invoiceType === 'deposit') {
        const transition = await applyDepositPaidProjectTransition(service, {
          projectId: result.projectId,
          clientId: result.clientId,
          invoiceId: result.invoiceId,
        });
        depositActivated = transition.changed && transition.to === 'active';
        if (transition.anomaly) {
          result.anomaly = result.anomaly ?? transition.anomaly;
        }
      } else if (result.invoiceType === 'final') {
        const transition = await applyFinalPaidProjectTransition(service, {
          projectId: result.projectId,
          clientId: result.clientId,
          invoiceId: result.invoiceId,
        });
        finalCompleted = transition.changed && transition.to === 'completed';
        if (transition.anomaly) {
          result.anomaly = result.anomaly ?? transition.anomaly;
        }
      }
    }
  }

  if (result.overpaymentMinor > 0) {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'payment.succeeded',
      clientId: result.clientId,
      projectId: result.projectId,
      subjectType: 'invoice',
      subjectId: result.invoiceId,
      metadata: {
        invoice_id: result.invoiceId,
        anomaly: 'overpayment',
        overpayment_minor: result.overpaymentMinor,
        currency: input.currency,
        provider: 'stripe',
      },
    });
  }

  // Email is a side effect — financial truth already committed. Never throw.
  if (result.paymentCreated) {
    try {
      const { data: inv } = await service
        .from('invoices')
        .select(
          'invoice_number, client_contact_email, client_contact_name, project_name, invoice_type',
        )
        .eq('id', result.invoiceId)
        .maybeSingle();

      const { enqueuePaymentReceivedEmails } = await import('../email/notifications');
      await enqueuePaymentReceivedEmails(service, {
        paymentId: result.paymentId,
        invoiceId: result.invoiceId,
        clientId: result.clientId,
        projectId: result.projectId,
        invoiceNumber: inv?.invoice_number ?? result.invoiceId,
        amountMinor: input.amountMinor,
        balanceDueMinor: result.balanceDueMinor,
        currency: input.currency,
        paymentMethod: input.paymentMethod ?? null,
        paidAt: result.paidAt,
        projectName: inv?.project_name ?? null,
        contactEmail: inv?.client_contact_email ?? null,
        contactName: inv?.client_contact_name ?? null,
        invoiceType: inv?.invoice_type ?? result.invoiceType,
        depositActivated,
        finalCompleted,
      });
    } catch {
      // Outbox enqueue failure must not fail Stripe webhook reconciliation.
    }
  }

  return result;
}

export async function reconcileSucceededStripeRefund(
  service: StudioSupabaseServiceClient,
  input: {
    providerRefundId: string;
    providerPaymentId: string;
    amountMinor: number;
    currency: 'CAD' | 'USD';
    refundedAt?: string | null;
    reason?: string | null;
    metadata?: Record<string, Json | undefined>;
  },
): Promise<{
  refundId: string;
  refundCreated: boolean;
  paymentId: string;
  invoiceId: string;
  invoiceStatus: string;
  projectId: string | null;
  clientId: string;
  anomaly: string | null;
}> {
  const metadata: Record<string, Json> = {};
  if (input.metadata) {
    for (const [key, value] of Object.entries(input.metadata)) {
      if (value !== undefined) metadata[key] = value;
    }
  }

  const { data, error } = await service.rpc('apply_succeeded_stripe_refund', {
    p_provider_refund_id: input.providerRefundId,
    p_provider_payment_id: input.providerPaymentId,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_refunded_at: input.refundedAt ?? new Date().toISOString(),
    p_reason: input.reason ?? null,
    p_metadata: metadata,
  });

  if (error || !data) {
    throw new ReconciliationError('failed', 'Unable to reconcile refund.');
  }

  const raw = data as {
    refund_id: string;
    refund_created: boolean;
    payment_id: string;
    invoice_id: string;
    invoice_status: string;
    project_id: string | null;
    client_id: string;
    anomaly: string | null;
  };

  if (raw.refund_created) {
    await recordStudioActivity(service, {
      actorProfileId: null,
      actorType: 'stripe',
      action: 'payment.refunded',
      clientId: raw.client_id,
      projectId: raw.project_id,
      subjectType: 'payment',
      subjectId: raw.payment_id,
      metadata: {
        invoice_id: raw.invoice_id,
        amount_minor: input.amountMinor,
        currency: input.currency,
        provider: 'stripe',
        note: 'project_status_not_regressed',
      },
    });
  }

  return {
    refundId: raw.refund_id,
    refundCreated: raw.refund_created,
    paymentId: raw.payment_id,
    invoiceId: raw.invoice_id,
    invoiceStatus: raw.invoice_status,
    projectId: raw.project_id,
    clientId: raw.client_id,
    anomaly: raw.anomaly,
  };
}
