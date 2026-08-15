/**
 * Refund helpers — Phase 11 foundation (webhook-driven reconciliation).
 * Admin-initiated Stripe refunds are optional and deferred beyond webhook persistence.
 */

import type { RefundRow } from './types';

export function netRefundableMinor(payment: {
  amount_minor: number;
  refunded_minor: number;
  status: string;
}): number {
  if (!['succeeded', 'partially_refunded'].includes(payment.status)) return 0;
  return Math.max(payment.amount_minor - payment.refunded_minor, 0);
}

export function summarizeRefunds(refunds: RefundRow[]): {
  succeededMinor: number;
  count: number;
} {
  let succeededMinor = 0;
  let count = 0;
  for (const refund of refunds) {
    if (refund.status !== 'succeeded') continue;
    succeededMinor += refund.amount_minor;
    count += 1;
  }
  return { succeededMinor, count };
}

/**
 * Accounting model (Phase 11):
 * net_paid = sum(succeeded payments − refunds)
 * balance_due = invoice.total − min(net_paid, total)
 * Refunds reopen balance. They do NOT auto-regress Project workflow.
 */
export const REFUND_ACCOUNTING_MODEL = 'net_paid_reopens_balance' as const;
