/**
 * Pure financial aggregation helpers (unit-testable) + Supabase queries.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { CurrencyCode } from '../supabase/domain';
import { isInvoiceOverdue } from '../invoices/workflow';
import {
  OUTSTANDING_INVOICE_STATUSES,
  REVENUE_PAYMENT_STATUSES,
  REVENUE_REFUND_STATUSES,
  REVENUE_CHART_MONTHS,
  DEFAULT_REPORTING_CURRENCY,
} from './definitions';
import {
  getBusinessMonthRange,
  getBusinessYearRange,
  getTrailingBusinessMonthRanges,
  businessMonthKey,
} from './periods';
import type { CurrencyAmount, CurrencyTotals, OutstandingMetrics, RevenueMetrics } from './types';

export function emptyTotals(): CurrencyTotals {
  return { byCurrency: [], multiCurrency: false };
}

export function groupCurrencyAmounts(
  rows: Array<{ currency: string; amountMinor: number }>,
): CurrencyTotals {
  const map = new Map<CurrencyCode, number>();
  for (const row of rows) {
    if (!row.amountMinor) continue;
    const currency = (row.currency || DEFAULT_REPORTING_CURRENCY) as CurrencyCode;
    map.set(currency, (map.get(currency) ?? 0) + row.amountMinor);
  }
  const byCurrency: CurrencyAmount[] = [...map.entries()]
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    byCurrency,
    multiCurrency: byCurrency.filter((r) => r.amountMinor !== 0).length > 1,
  };
}

/** Sum amounts for a single currency; returns 0 if absent. Never mixes currencies. */
export function amountForCurrency(totals: CurrencyTotals, currency: CurrencyCode): number {
  return totals.byCurrency.find((r) => r.currency === currency)?.amountMinor ?? 0;
}

/**
 * Cash-event net revenue for a period from payment and refund event lists.
 * Payments contribute on paid_at; refunds reduce on refunded_at.
 */
export function netCashRevenue(
  payments: Array<{ amount_minor: number; currency: string }>,
  refunds: Array<{ amount_minor: number; currency: string }>,
): CurrencyTotals {
  const rows: Array<{ currency: string; amountMinor: number }> = [
    ...payments.map((p) => ({ currency: p.currency, amountMinor: p.amount_minor })),
    ...refunds.map((r) => ({ currency: r.currency, amountMinor: -r.amount_minor })),
  ];
  return groupCurrencyAmounts(rows);
}

export function computeOutstandingFromInvoices(
  invoices: Array<{
    balance_due_minor: number;
    currency: string;
    status: string;
    due_date: string | null;
  }>,
  businessToday: string,
): Omit<OutstandingMetrics, 'availability'> {
  const unpaid = invoices.filter(
    (inv) =>
      inv.balance_due_minor > 0 &&
      OUTSTANDING_INVOICE_STATUSES.includes(inv.status as (typeof OUTSTANDING_INVOICE_STATUSES)[number]),
  );
  const overdue = unpaid.filter((inv) =>
    isInvoiceOverdue(
      {
        status: inv.status,
        due_date: inv.due_date,
        balance_due_minor: inv.balance_due_minor,
      },
      businessToday,
    ),
  );
  return {
    unpaidCount: unpaid.length,
    overdueCount: overdue.length,
    totals: groupCurrencyAmounts(
      unpaid.map((i) => ({ currency: i.currency, amountMinor: i.balance_due_minor })),
    ),
    overdueTotals: groupCurrencyAmounts(
      overdue.map((i) => ({ currency: i.currency, amountMinor: i.balance_due_minor })),
    ),
  };
}

export async function loadOutstandingMetrics(
  client: StudioSupabaseClient,
  businessToday: string,
): Promise<OutstandingMetrics> {
  try {
    const { data, error } = await client
      .from('invoices')
      .select('balance_due_minor, currency, status, due_date')
      .in('status', [...OUTSTANDING_INVOICE_STATUSES])
      .gt('balance_due_minor', 0);
    if (error) throw error;
    return {
      availability: 'ok',
      ...computeOutstandingFromInvoices(data ?? [], businessToday),
    };
  } catch (error) {
    console.error('[reporting] outstanding failed', error instanceof Error ? error.message : 'error');
    return {
      availability: 'unavailable',
      unpaidCount: 0,
      overdueCount: 0,
      totals: emptyTotals(),
      overdueTotals: emptyTotals(),
    };
  }
}

async function loadCashEvents(
  client: StudioSupabaseClient,
  startUtcIso: string,
  endUtcIso: string,
): Promise<{
  payments: Array<{ amount_minor: number; currency: string; paid_at: string }>;
  refunds: Array<{ amount_minor: number; currency: string; refunded_at: string }>;
}> {
  const [payRes, refRes] = await Promise.all([
    client
      .from('payments')
      .select('amount_minor, currency, paid_at')
      .in('status', [...REVENUE_PAYMENT_STATUSES])
      .not('paid_at', 'is', null)
      .gte('paid_at', startUtcIso)
      .lt('paid_at', endUtcIso),
    client
      .from('refunds')
      .select('amount_minor, currency, refunded_at')
      .in('status', [...REVENUE_REFUND_STATUSES])
      .not('refunded_at', 'is', null)
      .gte('refunded_at', startUtcIso)
      .lt('refunded_at', endUtcIso),
  ]);
  if (payRes.error) throw payRes.error;
  if (refRes.error) throw refRes.error;
  return {
    payments: (payRes.data ?? []).filter((p): p is typeof p & { paid_at: string } => Boolean(p.paid_at)),
    refunds: (refRes.data ?? []).filter(
      (r): r is typeof r & { refunded_at: string } => Boolean(r.refunded_at),
    ),
  };
}

export async function loadRevenueMetrics(
  client: StudioSupabaseClient,
  input: { now?: Date; timeZone: string },
): Promise<RevenueMetrics> {
  const now = input.now ?? new Date();
  try {
    const month = getBusinessMonthRange(now, input.timeZone);
    const year = getBusinessYearRange(now, input.timeZone);
    const chartStart = getTrailingBusinessMonthRanges(REVENUE_CHART_MONTHS, now, input.timeZone)[0];

    // One cash-event window covering chart + year (year may extend further back than chart).
    const fetchStart =
      year.startUtcIso < (chartStart?.startUtcIso ?? year.startUtcIso)
        ? year.startUtcIso
        : (chartStart?.startUtcIso ?? year.startUtcIso);

    const events = await loadCashEvents(client, fetchStart, now.toISOString());

    const inRange = <T extends { paid_at?: string; refunded_at?: string }>(
      rows: T[],
      start: string,
      end: string,
      field: 'paid_at' | 'refunded_at',
    ) =>
      rows.filter((row) => {
        const ts = row[field];
        return typeof ts === 'string' && ts >= start && ts < end;
      });

    const monthNet = netCashRevenue(
      inRange(events.payments, month.startUtcIso, month.endUtcIso, 'paid_at'),
      inRange(events.refunds, month.startUtcIso, month.endUtcIso, 'refunded_at'),
    );
    const yearNet = netCashRevenue(
      inRange(events.payments, year.startUtcIso, year.endUtcIso, 'paid_at'),
      inRange(events.refunds, year.startUtcIso, year.endUtcIso, 'refunded_at'),
    );

    const trailing = getTrailingBusinessMonthRanges(REVENUE_CHART_MONTHS, now, input.timeZone);
    const monthlySeries = trailing.map((range) => {
      const pay = events.payments.filter(
        (p) => p.paid_at >= range.startUtcIso && p.paid_at < range.endUtcIso,
      );
      const ref = events.refunds.filter(
        (r) => r.refunded_at >= range.startUtcIso && r.refunded_at < range.endUtcIso,
      );
      return {
        key: range.key,
        label: range.label,
        byCurrency: netCashRevenue(pay, ref).byCurrency,
      };
    });

    return {
      availability: 'ok',
      month: monthNet,
      year: yearNet,
      monthlySeries,
    };
  } catch (error) {
    console.error('[reporting] revenue failed', error instanceof Error ? error.message : 'error');
    return {
      availability: 'unavailable',
      month: emptyTotals(),
      year: emptyTotals(),
      monthlySeries: [],
    };
  }
}

export { businessMonthKey };
