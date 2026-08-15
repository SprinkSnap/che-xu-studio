import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  computeNetPaidMinor,
  deriveInvoicePaidFields,
  formatCardPaymentMethod,
} from '../../src/lib/payments/validation';
import {
  isInvoicePayableRelaxed,
  publicPaymentStatusFromInvoice,
} from '../../src/lib/payments/eligibility';
import { canTransitionProject } from '../../src/lib/projects/workflow';
import { assertPublicSitemapPath } from '../../src/lib/studio/sitemap';
import { SUPPORTED_STRIPE_EVENT_TYPES } from '../../src/lib/stripe/webhooks';
import { REFUND_ACCOUNTING_MODEL } from '../../src/lib/payments/refunds';

describe('payment eligibility', () => {
  const base = {
    id: 'inv1',
    client_id: 'c1',
    project_id: 'p1',
    invoice_number: 'CXS-2026-001',
    invoice_type: 'deposit',
    currency: 'CAD' as const,
    total_minor: 452000,
    amount_paid_minor: 0,
    balance_due_minor: 452000,
    updated_at: '2026-01-01T00:00:00Z',
    voided_at: null,
  };

  it('allows issued invoices with positive balance', () => {
    expect(isInvoicePayableRelaxed({ ...base, status: 'issued' })).toBe(true);
    expect(isInvoicePayableRelaxed({ ...base, status: 'sent' })).toBe(true);
    expect(isInvoicePayableRelaxed({ ...base, status: 'partially_paid', amount_paid_minor: 100, balance_due_minor: 451900 })).toBe(true);
  });

  it('denies draft, paid, void, and zero balance', () => {
    expect(isInvoicePayableRelaxed({ ...base, status: 'draft' })).toBe(false);
    expect(isInvoicePayableRelaxed({ ...base, status: 'paid', balance_due_minor: 0, amount_paid_minor: 452000 })).toBe(false);
    expect(isInvoicePayableRelaxed({ ...base, status: 'void' })).toBe(false);
    expect(isInvoicePayableRelaxed({ ...base, status: 'issued', balance_due_minor: 0 })).toBe(false);
  });
});

describe('invoice paid field derivation', () => {
  it('marks fully paid when net covers total', () => {
    const result = deriveInvoicePaidFields({
      totalMinor: 1000,
      netPaidMinor: 1000,
      previousPaidAt: null,
      paymentPaidAt: '2026-01-02T00:00:00Z',
    });
    expect(result).toEqual({
      amountPaidMinor: 1000,
      balanceDueMinor: 0,
      status: 'paid',
      paidAt: '2026-01-02T00:00:00Z',
      overpaymentMinor: 0,
    });
  });

  it('marks partially paid and does not set paid_at', () => {
    const result = deriveInvoicePaidFields({
      totalMinor: 1000,
      netPaidMinor: 400,
      previousPaidAt: null,
      paymentPaidAt: '2026-01-02T00:00:00Z',
    });
    expect(result.status).toBe('partially_paid');
    expect(result.balanceDueMinor).toBe(600);
    expect(result.paidAt).toBeNull();
  });

  it('caps overpayment and flags surplus', () => {
    const result = deriveInvoicePaidFields({
      totalMinor: 1000,
      netPaidMinor: 1200,
      previousPaidAt: null,
      paymentPaidAt: '2026-01-02T00:00:00Z',
    });
    expect(result.amountPaidMinor).toBe(1000);
    expect(result.balanceDueMinor).toBe(0);
    expect(result.overpaymentMinor).toBe(200);
    expect(result.status).toBe('paid');
  });

  it('recomputes net paid from payment rows', () => {
    expect(
      computeNetPaidMinor([
        { amount_minor: 1000, refunded_minor: 200, status: 'partially_refunded' },
        { amount_minor: 400, refunded_minor: 0, status: 'succeeded' },
        { amount_minor: 50, refunded_minor: 0, status: 'failed' },
      ]),
    ).toBe(1200);
  });
});

describe('deposit and final workflow allowlist', () => {
  it('allows deposit_due → active and awaiting_final_payment → completed', () => {
    expect(canTransitionProject('deposit_due', 'active')).toBe(true);
    expect(canTransitionProject('awaiting_final_payment', 'completed')).toBe(true);
    expect(canTransitionProject('inquiry', 'active')).toBe(false);
  });
});

describe('stripe webhook surface', () => {
  it('supports a focused checkout/refund event set', () => {
    expect(SUPPORTED_STRIPE_EVENT_TYPES).toContain('checkout.session.completed');
    expect(SUPPORTED_STRIPE_EVENT_TYPES).toContain('charge.refunded');
    expect(SUPPORTED_STRIPE_EVENT_TYPES.length).toBeLessThan(12);
  });

  it('formats safe card descriptors only', () => {
    expect(formatCardPaymentMethod({ brand: 'visa', last4: '4242' })).toBe('visa •••• 4242');
    expect(formatCardPaymentMethod({ brand: 'visa', last4: '4242', walletType: 'apple_pay' })).toContain(
      'apple_pay',
    );
  });

  it('documents refund accounting model', () => {
    expect(REFUND_ACCOUNTING_MODEL).toBe('net_paid_reopens_balance');
  });
});

describe('public payment status payload', () => {
  it('exposes only client-safe fields', () => {
    const status = publicPaymentStatusFromInvoice({
      status: 'paid',
      balance_due_minor: 0,
      amount_paid_minor: 452000,
      total_minor: 452000,
      currency: 'CAD',
    });
    expect(status.paid).toBe(true);
    expect(status.payable).toBe(false);
    expect(Object.keys(status).sort()).toEqual([
      'amountPaidMinor',
      'balanceDueMinor',
      'currency',
      'invoiceStatus',
      'paid',
      'payable',
      'totalMinor',
    ]);
  });
});

describe('phase 11 migration + privacy', () => {
  it('ships stripe payment helpers migration with service-only RPCs', () => {
    const sql = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/202608140014_stripe_payment_helpers.sql'),
      'utf8',
    );
    expect(sql).toContain('public_links_active_invoice_unique_idx');
    expect(sql).toContain('invoice_checkout_sessions');
    expect(sql).toContain('apply_succeeded_stripe_payment');
    expect(sql).toContain('apply_succeeded_stripe_refund');
    expect(sql).toContain('GRANT EXECUTE');
    expect(sql).toContain('TO service_role');
    expect(sql).toContain('REVOKE ALL');
  });

  it('phase 12 drops single-active invoice link uniqueness for multi-link emails', () => {
    const sql = readFileSync(
      path.join(process.cwd(), 'supabase/migrations/202608140015_email_outbox_reminders.sql'),
      'utf8',
    );
    expect(sql).toContain('DROP INDEX IF EXISTS public.public_links_active_invoice_unique_idx');
  });

  it('keeps invoice paths out of public sitemap helpers', () => {
    expect(assertPublicSitemapPath('/invoice/abc')).toBe(false);
    expect(assertPublicSitemapPath('/pricing')).toBe(true);
  });

  it('does not put PUBLIC_ on Stripe secret env names in examples', () => {
    const example = readFileSync(path.join(process.cwd(), '.dev.vars.example'), 'utf8');
    expect(example).toMatch(/STRIPE_SECRET_KEY=/);
    expect(example).toMatch(/STRIPE_WEBHOOK_SECRET=/);
    expect(example).not.toMatch(/PUBLIC_STRIPE_SECRET/);
    expect(example).not.toMatch(/PUBLIC_STRIPE_WEBHOOK/);
  });

  it('checkout metadata builder omits public tokens', () => {
    const checkoutSrc = readFileSync(
      path.join(process.cwd(), 'src/lib/stripe/checkout.ts'),
      'utf8',
    );
    expect(checkoutSrc).toMatch(/invoice_id/);
    expect(checkoutSrc).not.toMatch(/rawToken.*metadata/);
    expect(checkoutSrc).toMatch(/Never in Stripe metadata|never in Stripe metadata/i);
  });
});

describe('secret boundary modules', () => {
  it('stripe server module is not imported from client components', () => {
    const componentsDir = path.join(process.cwd(), 'src/components');
    const walk = (dir: string): string[] => {
      const entries = readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) files.push(full);
      }
      return files;
    };
    for (const file of walk(componentsDir)) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/lib\/stripe\/server/);
      expect(src).not.toMatch(/STRIPE_SECRET_KEY/);
      expect(src).not.toMatch(/STRIPE_WEBHOOK_SECRET/);
    }
  });
});
