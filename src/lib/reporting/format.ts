/**
 * Display helpers for dashboard currency totals.
 */

import { formatMoney } from '../clients/format';
import type { CurrencyCode } from '../supabase/domain';
import type { CurrencyTotals } from './types';

export function formatCurrencyTotals(
  totals: CurrencyTotals,
  fallbackCurrency: CurrencyCode,
): { primary: string; secondary: string | null } {
  const nonzero = totals.byCurrency.filter((r) => r.amountMinor !== 0);
  if (nonzero.length === 0) {
    return { primary: formatMoney(0, fallbackCurrency), secondary: null };
  }
  if (nonzero.length === 1) {
    return {
      primary: formatMoney(nonzero[0].amountMinor, nonzero[0].currency),
      secondary: null,
    };
  }
  return {
    primary: nonzero
      .map((r) => `${formatMoney(r.amountMinor, r.currency)} ${r.currency}`)
      .join(' · '),
    secondary: 'Shown by currency — not converted',
  };
}

export function formatMetricValue(
  availability: 'ok' | 'unavailable' | 'hidden',
  totals: CurrencyTotals,
  fallbackCurrency: CurrencyCode,
): { value: string; hint: string | null } {
  if (availability === 'unavailable') {
    return { value: 'Unavailable', hint: 'Could not load this metric' };
  }
  if (availability === 'hidden') {
    return { value: '', hint: null };
  }
  const formatted = formatCurrencyTotals(totals, fallbackCurrency);
  return { value: formatted.primary, hint: formatted.secondary };
}
