/**
 * Shared money parsing for Studio forms.
 * Persist integer minor units; never use naive parseFloat * 100.
 */

import type { CurrencyCode } from '../supabase/domain';

const FRACTION_DIGITS: Record<CurrencyCode, number> = {
  CAD: 2,
  USD: 2,
};

/**
 * Parse a major-unit decimal string into minor units.
 * Accepts: "8000", "8000.00", "8,000.50"
 * Rejects malformed strings and excess fractional precision.
 */
export function parseMajorToMinor(
  raw: string,
  currency: CurrencyCode = 'CAD',
): { ok: true; minor: number } | { ok: false; error: string } {
  const digits = FRACTION_DIGITS[currency] ?? 2;
  const cleaned = raw.trim().replace(/,/g, '');
  if (!cleaned) return { ok: false, error: 'Enter a project price' };
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: 'Enter a valid amount' };
  }

  const negative = cleaned.startsWith('-');
  const absolute = negative ? cleaned.slice(1) : cleaned;
  const [wholePart, fractionPart = ''] = absolute.split('.');
  if (fractionPart.length > digits) {
    return { ok: false, error: `Use at most ${digits} decimal places` };
  }

  const whole = Number.parseInt(wholePart || '0', 10);
  if (!Number.isSafeInteger(whole)) {
    return { ok: false, error: 'Amount is too large' };
  }

  const padded = fractionPart.padEnd(digits, '0');
  const fraction = padded ? Number.parseInt(padded, 10) : 0;
  const scale = 10 ** digits;
  const minor = whole * scale + fraction;
  if (!Number.isSafeInteger(minor)) {
    return { ok: false, error: 'Amount is too large' };
  }
  if (negative && minor !== 0) {
    return { ok: false, error: 'Price cannot be negative' };
  }
  return { ok: true, minor };
}

/** Format minor units as a major-unit string suitable for form inputs (no currency symbol). */
export function formatMinorAsMajorInput(minor: number, currency: CurrencyCode = 'CAD'): string {
  const digits = FRACTION_DIGITS[currency] ?? 2;
  const scale = 10 ** digits;
  const whole = Math.trunc(minor / scale);
  const fraction = Math.abs(minor % scale);
  if (digits === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(digits, '0')}`;
}

export function percentInputToBps(raw: string): { ok: true; bps: number } | { ok: false; error: string } {
  const cleaned = raw.trim().replace(/%/g, '');
  if (!cleaned) return { ok: false, error: 'Enter a percentage' };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: 'Enter a valid percentage' };
  }
  const [wholePart, fractionPart = ''] = cleaned.split('.');
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fractionPart.padEnd(2, '0') || '0', 10);
  const bps = whole * 100 + frac;
  if (!Number.isSafeInteger(bps)) {
    return { ok: false, error: 'Percentage is too large' };
  }
  return { ok: true, bps };
}

export function bpsToPercentInput(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = Math.abs(bps % 100);
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}
