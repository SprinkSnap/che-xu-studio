/**
 * Shared Studio finance — exact minor-unit and basis-point math.
 * Proposal (Phase 8) and Invoice (Phase 9) must reuse these helpers.
 */

export function roundHalfUpMinor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.trunc(Math.abs(value) + 0.5);
}

/** Quantity with up to 4 decimal places → scaled integer (×10_000). */
export function parseQuantityToScaled(
  raw: string,
): { ok: true; scaled: number } | { ok: false; error: string } {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return { ok: false, error: 'Enter a quantity' };
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) {
    return { ok: false, error: 'Use a positive quantity with at most 4 decimals' };
  }
  const [wholePart, fractionPart = ''] = cleaned.split('.');
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fractionPart.padEnd(4, '0') || '0', 10);
  const scaled = whole * 10_000 + frac;
  if (!Number.isSafeInteger(scaled) || scaled <= 0) {
    return { ok: false, error: 'Quantity must be greater than zero' };
  }
  return { ok: true, scaled };
}

export function formatScaledQuantity(scaled: number): string {
  const whole = Math.trunc(scaled / 10_000);
  const frac = Math.abs(scaled % 10_000);
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(4, '0').replace(/0+$/, '')}`;
}

/** amount_minor = trunc(quantity_scaled * rate_minor / 10_000) */
export function lineAmountMinor(quantityScaled: number, rateMinor: number): number {
  if (quantityScaled <= 0 || rateMinor < 0) return 0;
  return Math.trunc((quantityScaled * rateMinor) / 10_000);
}

export type ProposalLineInput = {
  optional: boolean;
  selected: boolean;
  amountMinor: number;
};

export type ProposalTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxableBaseMinor: number;
  taxMinor: number;
  totalMinor: number;
};

/**
 * Authoritative proposal totals.
 * Only selected, non-optional-unselected lines count toward subtotal.
 * Optional + selected add-ons are included; optional + unselected are excluded.
 */
export function calculateProposalTotals(input: {
  lines: ProposalLineInput[];
  discountMinor: number;
  taxBps: number;
}): ProposalTotals {
  const subtotalMinor = input.lines.reduce((sum, line) => {
    if (line.optional && !line.selected) return sum;
    return sum + Math.max(0, line.amountMinor);
  }, 0);

  const discountMinor = Math.min(Math.max(0, input.discountMinor), subtotalMinor);
  const taxableBaseMinor = subtotalMinor - discountMinor;
  const taxBps = Math.max(0, input.taxBps);
  const taxMinor = roundHalfUpMinor((taxableBaseMinor * taxBps) / 10_000);
  const totalMinor = taxableBaseMinor + taxMinor;

  return {
    subtotalMinor,
    discountMinor,
    taxableBaseMinor,
    taxMinor,
    totalMinor,
  };
}

export function depositBaseMinor(projectPriceMinor: number, depositBps: number): number {
  return Math.trunc((Math.max(0, projectPriceMinor) * Math.max(0, depositBps)) / 10_000);
}

export function formatPaymentScheduleText(input: {
  depositBps: number;
  currencyLabel?: string;
}): string {
  const depositPct = (input.depositBps / 100).toFixed(input.depositBps % 100 === 0 ? 0 : 2);
  const remainingBps = Math.max(0, 10_000 - input.depositBps);
  const remainingPct = (remainingBps / 100).toFixed(remainingBps % 100 === 0 ? 0 : 2);
  return [
    `${depositPct}% deposit to begin.`,
    `${remainingPct} remaining balance upon project completion.`,
    'Applicable tax is calculated when invoices are issued.',
  ].join('\n');
}
