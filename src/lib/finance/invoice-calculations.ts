/**
 * Invoice allocation — deposit/final split from an agreed proposal snapshot.
 * Final invoice absorbs remainder so deposit + final = agreed totals exactly.
 */

import { calculateProposalTotals, roundHalfUpMinor } from './calculations';

/** Truncate toward zero (matches Phase 8 depositBaseMinor). */
export function allocateByBps(totalMinor: number, bps: number): number {
  const safeTotal = Math.max(0, totalMinor);
  const safeBps = Math.max(0, Math.min(10_000, bps));
  return Math.trunc((safeTotal * safeBps) / 10_000);
}

export type ProposalFinancialSnapshot = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  depositBps: number;
};

export type StageAllocation = {
  netBaseMinor: number;
  depositBaseMinor: number;
  finalBaseMinor: number;
  depositTaxMinor: number;
  finalTaxMinor: number;
  depositTotalMinor: number;
  finalTotalMinor: number;
  depositBps: number;
};

/**
 * Authoritative two-stage allocation from a proposal version snapshot.
 *
 * net_base = subtotal - discount (clamped)
 * deposit_base = trunc(net_base * deposit_bps / 10000)
 * final_base   = net_base - deposit_base
 * deposit_tax  = trunc(tax_minor * deposit_bps / 10000)
 * final_tax    = tax_minor - deposit_tax
 *
 * Guarantees:
 *   deposit_base + final_base = net_base
 *   deposit_tax + final_tax = tax_minor
 *   deposit_total + final_total = proposal total_minor (when totals are consistent)
 *
 * Fails closed when snapshot.totalMinor disagrees with net+tax (corrupt snapshot).
 */
export function allocateDepositFinal(snapshot: ProposalFinancialSnapshot): StageAllocation {
  const discountMinor = Math.min(Math.max(0, snapshot.discountMinor), Math.max(0, snapshot.subtotalMinor));
  const netBaseMinor = Math.max(0, snapshot.subtotalMinor) - discountMinor;
  const taxMinor = Math.max(0, snapshot.taxMinor);
  const depositBps = Math.max(0, Math.min(10_000, snapshot.depositBps));
  const expectedTotal = netBaseMinor + taxMinor;
  if (snapshot.totalMinor !== expectedTotal) {
    throw new Error(
      `Proposal financial snapshot inconsistent: total_minor ${snapshot.totalMinor} !== net+tax ${expectedTotal}`,
    );
  }

  const depositBase = allocateByBps(netBaseMinor, depositBps);
  const finalBase = netBaseMinor - depositBase;
  const depositTax = allocateByBps(taxMinor, depositBps);
  const finalTax = taxMinor - depositTax;

  return {
    netBaseMinor,
    depositBaseMinor: depositBase,
    finalBaseMinor: finalBase,
    depositTaxMinor: depositTax,
    finalTaxMinor: finalTax,
    depositTotalMinor: depositBase + depositTax,
    finalTotalMinor: finalBase + finalTax,
    depositBps,
  };
}

export type ManualInvoiceLine = {
  amountMinor: number;
};

export type ManualInvoiceTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  balanceDueMinor: number;
};

/**
 * Manual invoice totals — same tax rounding as proposals (half-up on taxable base).
 * Discount is not duplicated across stages; it applies once to the manual invoice.
 */
export function calculateManualInvoiceTotals(input: {
  lines: ManualInvoiceLine[];
  discountMinor: number;
  taxBps: number;
  amountPaidMinor?: number;
}): ManualInvoiceTotals {
  const proposalLike = calculateProposalTotals({
    lines: input.lines.map((line) => ({
      optional: false,
      selected: true,
      amountMinor: line.amountMinor,
    })),
    discountMinor: input.discountMinor,
    taxBps: input.taxBps,
  });
  const amountPaid = Math.max(0, input.amountPaidMinor ?? 0);
  if (amountPaid > proposalLike.totalMinor) {
    throw new Error('amount_paid_minor cannot exceed total_minor');
  }
  return {
    subtotalMinor: proposalLike.subtotalMinor,
    discountMinor: proposalLike.discountMinor,
    taxMinor: proposalLike.taxMinor,
    totalMinor: proposalLike.totalMinor,
    balanceDueMinor: proposalLike.totalMinor - amountPaid,
  };
}

export function balanceDueMinor(totalMinor: number, amountPaidMinor: number): number {
  return Math.max(0, Math.max(0, totalMinor) - Math.max(0, amountPaidMinor));
}

/** Re-export for callers that only import invoice finance. */
export { roundHalfUpMinor, calculateProposalTotals };
