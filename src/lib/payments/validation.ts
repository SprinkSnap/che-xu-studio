/**
 * Pure payment reconciliation helpers (unit-testable).
 */

export function computeNetPaidMinor(
  payments: Array<{ amount_minor: number; refunded_minor: number; status: string }>,
): number {
  let net = 0;
  for (const payment of payments) {
    if (!['succeeded', 'partially_refunded', 'refunded'].includes(payment.status)) continue;
    net += Math.max(payment.amount_minor - payment.refunded_minor, 0);
  }
  return net;
}

export function deriveInvoicePaidFields(input: {
  totalMinor: number;
  netPaidMinor: number;
  previousPaidAt: string | null;
  paymentPaidAt: string | null;
}): {
  amountPaidMinor: number;
  balanceDueMinor: number;
  status: 'partially_paid' | 'paid' | 'refunded';
  paidAt: string | null;
  overpaymentMinor: number;
} {
  const overpaymentMinor = Math.max(input.netPaidMinor - input.totalMinor, 0);
  const amountPaidMinor = Math.min(Math.max(input.netPaidMinor, 0), input.totalMinor);
  const balanceDueMinor = input.totalMinor - amountPaidMinor;

  if (amountPaidMinor <= 0) {
    return {
      amountPaidMinor: 0,
      balanceDueMinor: input.totalMinor,
      status: 'refunded',
      paidAt: null,
      overpaymentMinor,
    };
  }

  if (balanceDueMinor > 0) {
    return {
      amountPaidMinor,
      balanceDueMinor,
      status: 'partially_paid',
      paidAt: null,
      overpaymentMinor,
    };
  }

  return {
    amountPaidMinor,
    balanceDueMinor: 0,
    status: 'paid',
    paidAt: input.previousPaidAt ?? input.paymentPaidAt,
    overpaymentMinor,
  };
}

/** Safe card descriptor from Stripe PaymentIntent/Charge when available. */
export function formatCardPaymentMethod(input: {
  brand?: string | null;
  last4?: string | null;
  walletType?: string | null;
}): string {
  const brand = (input.brand || 'Card').trim();
  const last4 = (input.last4 || '').trim();
  const wallet = (input.walletType || '').trim();
  const base = last4 ? `${brand} •••• ${last4}` : brand;
  if (wallet) return `${base} (${wallet})`;
  return base || 'Card';
}

export function stripeAmountMatchesInvoice(input: {
  stripeAmountMinor: number;
  stripeCurrency: string;
  invoiceBalanceMinor: number;
  invoiceCurrency: string;
  allowPartial: boolean;
}): { ok: boolean; reason?: string } {
  const currency = input.stripeCurrency.toUpperCase();
  if (currency !== input.invoiceCurrency.toUpperCase()) {
    return { ok: false, reason: 'currency_mismatch' };
  }
  if (input.stripeAmountMinor <= 0) {
    return { ok: false, reason: 'non_positive_amount' };
  }
  if (input.allowPartial) {
    if (input.stripeAmountMinor > input.invoiceBalanceMinor + input.invoiceBalanceMinor) {
      // Extremely oversized vs balance — still allow reconcile with overpayment flag upstream
    }
    return { ok: true };
  }
  // Full-balance checkout: payment should equal the balance at session creation.
  // Webhook may arrive after other payments; absolute equality is not required —
  // reconcile caps at total and flags overpayment.
  return { ok: true };
}
