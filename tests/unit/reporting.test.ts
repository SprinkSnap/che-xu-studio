import { describe, expect, it } from 'vitest';
import {
  computeOutstandingFromInvoices,
  groupCurrencyAmounts,
  netCashRevenue,
  amountForCurrency,
} from '../../src/lib/reporting/financials';
import {
  getBusinessMonthRange,
  getBusinessYearRange,
  getBusinessToday,
  zonedLocalToUtc,
  businessMonthKey,
  startOfBusinessDayUtc,
} from '../../src/lib/reporting/periods';
import {
  ACTIVE_PROJECT_STATUSES,
  AWAITING_APPROVAL_PROPOSAL_STATUSES,
  OUTSTANDING_INVOICE_STATUSES,
} from '../../src/lib/reporting/definitions';
import { isInvoiceOverdue } from '../../src/lib/invoices/workflow';
import { formatCurrencyTotals } from '../../src/lib/reporting/format';

describe('reporting outstanding invoices', () => {
  it('sums collectible balances and excludes draft/void/paid', () => {
    const result = computeOutstandingFromInvoices(
      [
        {
          balance_due_minor: 60_000,
          currency: 'CAD',
          status: 'sent',
          due_date: '2026-09-01',
        },
        {
          balance_due_minor: 200_000,
          currency: 'CAD',
          status: 'draft',
          due_date: '2026-09-01',
        },
        {
          balance_due_minor: 300_000,
          currency: 'CAD',
          status: 'void',
          due_date: '2026-08-01',
        },
        {
          balance_due_minor: 0,
          currency: 'CAD',
          status: 'paid',
          due_date: '2026-08-01',
        },
      ],
      '2026-08-15',
    );
    expect(result.unpaidCount).toBe(1);
    expect(amountForCurrency(result.totals, 'CAD')).toBe(60_000);
    expect(result.overdueCount).toBe(0);
  });

  it('counts overdue value separately', () => {
    const result = computeOutstandingFromInvoices(
      [
        {
          balance_due_minor: 10_000,
          currency: 'CAD',
          status: 'issued',
          due_date: '2026-08-01',
        },
        {
          balance_due_minor: 20_000,
          currency: 'CAD',
          status: 'sent',
          due_date: '2026-08-20',
        },
      ],
      '2026-08-15',
    );
    expect(result.overdueCount).toBe(1);
    expect(amountForCurrency(result.overdueTotals, 'CAD')).toBe(10_000);
    expect(amountForCurrency(result.totals, 'CAD')).toBe(30_000);
  });
});

describe('reporting overdue helper', () => {
  const today = '2026-08-15';
  it('marks past-due collectible invoices overdue', () => {
    expect(
      isInvoiceOverdue(
        { status: 'sent', due_date: '2026-08-14', balance_due_minor: 100 },
        today,
      ),
    ).toBe(true);
  });
  it('does not mark due today as overdue', () => {
    expect(
      isInvoiceOverdue(
        { status: 'sent', due_date: '2026-08-15', balance_due_minor: 100 },
        today,
      ),
    ).toBe(false);
  });
  it('excludes draft paid void and zero balance', () => {
    expect(
      isInvoiceOverdue(
        { status: 'draft', due_date: '2026-08-01', balance_due_minor: 100 },
        today,
      ),
    ).toBe(false);
    expect(
      isInvoiceOverdue(
        { status: 'paid', due_date: '2026-08-01', balance_due_minor: 0 },
        today,
      ),
    ).toBe(false);
    expect(
      isInvoiceOverdue(
        { status: 'void', due_date: '2026-08-01', balance_due_minor: 100 },
        today,
      ),
    ).toBe(false);
    expect(
      isInvoiceOverdue(
        { status: 'sent', due_date: '2026-08-01', balance_due_minor: 0 },
        today,
      ),
    ).toBe(false);
  });
});

describe('reporting cash revenue', () => {
  it('nets payments and refunds in minor units', () => {
    const net = netCashRevenue(
      [
        { amount_minor: 100_000, currency: 'CAD' },
        { amount_minor: 50_000, currency: 'CAD' },
      ],
      [{ amount_minor: 20_000, currency: 'CAD' }],
    );
    expect(amountForCurrency(net, 'CAD')).toBe(130_000);
  });

  it('never silently combines CAD and USD', () => {
    const totals = groupCurrencyAmounts([
      { currency: 'CAD', amountMinor: 100_000 },
      { currency: 'USD', amountMinor: 50_000 },
    ]);
    expect(totals.multiCurrency).toBe(true);
    expect(amountForCurrency(totals, 'CAD')).toBe(100_000);
    expect(amountForCurrency(totals, 'USD')).toBe(50_000);
    const formatted = formatCurrencyTotals(totals, 'CAD');
    expect(formatted.primary).toContain('CAD');
    expect(formatted.primary).toContain('USD');
    expect(formatted.secondary).toMatch(/not converted/i);
  });
});

describe('reporting timezone periods', () => {
  it('assigns Toronto month for UTC boundary payments', () => {
    // 2026-09-01 01:00 UTC is still Aug 31 evening in America/Toronto (EDT, UTC-4)
    const ts = '2026-09-01T01:00:00.000Z';
    expect(businessMonthKey(ts, 'America/Toronto')).toBe('2026-08');
    expect(businessMonthKey(ts, 'UTC')).toBe('2026-09');
  });

  it('builds month range from business-local midnight', () => {
    const now = new Date('2026-08-15T18:00:00.000Z');
    const month = getBusinessMonthRange(now, 'America/Toronto');
    expect(month.startDate).toBe('2026-08-01');
    expect(month.businessToday).toBe(getBusinessToday(now, 'America/Toronto'));
    const start = startOfBusinessDayUtc('2026-08-01', 'America/Toronto');
    expect(month.startUtcIso).toBe(start.toISOString());
    // Aug 1 00:00 Toronto (EDT) = Aug 1 04:00 UTC
    expect(start.toISOString()).toBe('2026-08-01T04:00:00.000Z');
  });

  it('builds year range from local Jan 1', () => {
    const now = new Date('2026-08-15T18:00:00.000Z');
    const year = getBusinessYearRange(now, 'America/Toronto');
    expect(year.startDate).toBe('2026-01-01');
    const jan1 = zonedLocalToUtc(2026, 1, 1, 0, 0, 0, 'America/Toronto');
    expect(year.startUtcIso).toBe(jan1.toISOString());
  });

  it('attributes refunds by refunded_at month in cash-event model', () => {
    // Documented semantics: July payment + August refund → August net reduced.
    const julyPayment = { amount_minor: 100_000, currency: 'CAD' };
    const augustRefund = { amount_minor: 25_000, currency: 'CAD' };
    const julyNet = netCashRevenue([julyPayment], []);
    const augustNet = netCashRevenue([], [augustRefund]);
    expect(amountForCurrency(julyNet, 'CAD')).toBe(100_000);
    expect(amountForCurrency(augustNet, 'CAD')).toBe(-25_000);
  });
});

describe('reporting status sets', () => {
  it('defines active projects narrowly', () => {
    expect([...ACTIVE_PROJECT_STATUSES]).toEqual(['active']);
  });

  it('awaits approval for sent and viewed proposals', () => {
    expect([...AWAITING_APPROVAL_PROPOSAL_STATUSES]).toEqual(['sent', 'viewed']);
  });

  it('lists outstanding invoice statuses', () => {
    expect(OUTSTANDING_INVOICE_STATUSES).toContain('issued');
    expect(OUTSTANDING_INVOICE_STATUSES).toContain('overdue');
    expect(OUTSTANDING_INVOICE_STATUSES).not.toContain('draft');
    expect(OUTSTANDING_INVOICE_STATUSES).not.toContain('void');
  });
});
