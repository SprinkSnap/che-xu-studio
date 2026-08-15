import { describe, expect, it } from 'vitest';
import {
  allocateByBps,
  allocateDepositFinal,
  calculateManualInvoiceTotals,
  balanceDueMinor,
} from '../../src/lib/finance/invoice-calculations';
import { lineAmountMinor, parseQuantityToScaled } from '../../src/lib/finance/calculations';
import {
  canEditInvoiceFinancials,
  canIssueInvoice,
  canVoidInvoice,
  defaultDueDate,
  displayInvoiceStatus,
  generationKeyFor,
  isInvoiceOverdue,
  addDaysIso,
} from '../../src/lib/invoices/workflow';
import {
  invoiceListQuerySchema,
  parseManualInvoiceCreatePayload,
} from '../../src/lib/invoices/validation';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('manual invoice calculations', () => {
  it('computes subtotal tax and discount exactly', () => {
    const totals = calculateManualInvoiceTotals({
      lines: [
        { amountMinor: lineAmountMinor(20_000, 100_000) }, // 2 × 1000
        { amountMinor: lineAmountMinor(10_000, 50_000) }, // 1 × 500
      ],
      discountMinor: 100_00,
      taxBps: 1300,
    });
    // subtotal 250000 − 10000 = 240000; tax = round(240000*0.13)=31200; total=271200
    expect(totals.subtotalMinor).toBe(250_000);
    expect(totals.discountMinor).toBe(10_000);
    expect(totals.taxMinor).toBe(31_200);
    expect(totals.totalMinor).toBe(271_200);
    expect(totals.balanceDueMinor).toBe(271_200);
  });

  it('parses quantity without float drift', () => {
    expect(parseQuantityToScaled('2')).toEqual({ ok: true, scaled: 20_000 });
    expect(lineAmountMinor(20_000, 100_000)).toBe(200_000);
  });
});

describe('deposit/final allocation', () => {
  it('allocates 50/50 on $8000 + $1040 tax', () => {
    const allocation = allocateDepositFinal({
      subtotalMinor: 800_000,
      discountMinor: 0,
      taxMinor: 104_000,
      totalMinor: 904_000,
      depositBps: 5000,
    });
    expect(allocation.depositBaseMinor).toBe(400_000);
    expect(allocation.depositTaxMinor).toBe(52_000);
    expect(allocation.depositTotalMinor).toBe(452_000);
    expect(allocation.finalBaseMinor).toBe(400_000);
    expect(allocation.finalTaxMinor).toBe(52_000);
    expect(allocation.finalTotalMinor).toBe(452_000);
    expect(allocation.depositTotalMinor + allocation.finalTotalMinor).toBe(904_000);
  });

  it('allocates 40/60 exactly', () => {
    const allocation = allocateDepositFinal({
      subtotalMinor: 800_000,
      discountMinor: 0,
      taxMinor: 104_000,
      totalMinor: 904_000,
      depositBps: 4000,
    });
    expect(allocation.depositBaseMinor).toBe(320_000);
    expect(allocation.finalBaseMinor).toBe(480_000);
    expect(allocation.depositTaxMinor).toBe(41_600);
    expect(allocation.finalTaxMinor).toBe(62_400);
    expect(allocation.depositTotalMinor + allocation.finalTotalMinor).toBe(904_000);
  });

  it('absorbs odd-cent remainder on final', () => {
    const allocation = allocateDepositFinal({
      subtotalMinor: 100_01,
      discountMinor: 0,
      taxMinor: 1,
      totalMinor: 100_02,
      depositBps: 5000,
    });
    expect(allocateByBps(100_01, 5000)).toBe(5000);
    expect(allocation.depositBaseMinor + allocation.finalBaseMinor).toBe(100_01);
    expect(allocation.depositTaxMinor + allocation.finalTaxMinor).toBe(1);
    expect(allocation.depositTotalMinor + allocation.finalTotalMinor).toBe(100_02);
  });

  it('does not duplicate discounts across stages', () => {
    const allocation = allocateDepositFinal({
      subtotalMinor: 800_000,
      discountMinor: 50_000,
      taxMinor: 97_500,
      totalMinor: 847_500,
      depositBps: 5000,
    });
    expect(allocation.netBaseMinor).toBe(750_000);
    expect(allocation.depositBaseMinor + allocation.finalBaseMinor).toBe(750_000);
    expect(allocation.depositTotalMinor + allocation.finalTotalMinor).toBe(847_500);
  });
});

describe('invoice workflow helpers', () => {
  it('derives overdue correctly with date-only semantics', () => {
    const base = {
      status: 'issued' as const,
      due_date: '2026-08-01',
      balance_due_minor: 100,
    };
    expect(isInvoiceOverdue(base, '2026-08-02')).toBe(true);
    expect(isInvoiceOverdue(base, '2026-08-01')).toBe(false);
    expect(isInvoiceOverdue({ ...base, balance_due_minor: 0 }, '2026-08-02')).toBe(false);
    expect(isInvoiceOverdue({ ...base, status: 'paid' }, '2026-08-02')).toBe(false);
    expect(isInvoiceOverdue({ ...base, status: 'void' }, '2026-08-02')).toBe(false);
    expect(isInvoiceOverdue({ ...base, status: 'draft' }, '2026-08-02')).toBe(false);
    expect(displayInvoiceStatus(base, '2026-08-02').label).toBe('Overdue');
  });

  it('gates edit/issue/void', () => {
    expect(canEditInvoiceFinancials('draft')).toBe(true);
    expect(canEditInvoiceFinancials('issued')).toBe(false);
    expect(canIssueInvoice('draft')).toBe(true);
    expect(canVoidInvoice({ status: 'issued', amount_paid_minor: 0 })).toBe(true);
    expect(canVoidInvoice({ status: 'issued', amount_paid_minor: 1 })).toBe(false);
    expect(canVoidInvoice({ status: 'draft', amount_paid_minor: 0 })).toBe(false);
  });

  it('defaults deposit due on issue date', () => {
    expect(
      defaultDueDate({ invoiceType: 'deposit', issueDate: '2026-08-14', paymentTermsDays: 14 }),
    ).toBe('2026-08-14');
    expect(
      defaultDueDate({ invoiceType: 'final', issueDate: '2026-08-14', paymentTermsDays: 14 }),
    ).toBe(addDaysIso('2026-08-14', 14));
  });

  it('builds deterministic generation keys', () => {
    expect(generationKeyFor('abc', 'deposit')).toBe('abc:deposit');
    expect(generationKeyFor('abc', 'final')).toBe('abc:final');
  });

  it('keeps balance invariant helper', () => {
    expect(balanceDueMinor(100, 40)).toBe(60);
    expect(balanceDueMinor(100, 100)).toBe(0);
  });
});

describe('invoice validation', () => {
  it('whitelists list sort/status', () => {
    const parsed = invoiceListQuerySchema.parse({
      q: '  CXS ',
      status: 'overdue',
      type: 'deposit',
      sort: 'balance_desc',
      page: '1',
    });
    expect(parsed.q).toBe('CXS');
    expect(invoiceListQuerySchema.safeParse({ sort: 'drop table' }).success).toBe(false);
  });

  it('parses manual create payload and recalculates totals', () => {
    const parsed = parseManualInvoiceCreatePayload({
      clientId: '11111111-1111-4111-8111-111111111111',
      projectId: '',
      invoiceType: 'manual',
      issueDate: '2026-08-14',
      dueDate: '2026-08-28',
      currency: 'CAD',
      discount: '0',
      taxPercent: '13',
      paymentInstructions: '',
      itemsJson: JSON.stringify([
        { description: 'Design', quantity: '2', rate: '1000.00' },
        { description: 'Add-on', quantity: '1', rate: '500.00' },
      ]),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totals.subtotalMinor).toBe(250_000);
      expect(parsed.data.totals.taxMinor).toBe(32_500);
      expect(parsed.data.totals.totalMinor).toBe(282_500);
    }
  });
});

describe('invoice migration', () => {
  it('adds generation_key uniqueness and snapshot columns', () => {
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const file = readdirSync(dir).find((name) => name.includes('invoice_management'));
    expect(file).toBeTruthy();
    const sql = readFileSync(path.join(dir, file!), 'utf8');
    expect(sql).toContain('generation_key');
    expect(sql).toContain('invoices_generation_key_active_unique_idx');
    expect(sql).toContain('client_display_name');
    expect(sql).toContain('enforce_invoice_financial_immutability');
  });
});
