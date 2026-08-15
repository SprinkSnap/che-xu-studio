/**
 * Phase 15 — Security + financial integrity regression tests.
 * Keep these permanently; they encode launch-gate invariants.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  allocateDepositFinal,
  balanceDueMinor,
} from '../../src/lib/finance/invoice-calculations';
import {
  assertStripeKeyModeConsistency,
  isDangerousStripeLiveLocalhostCombo,
  stripeKeyMode,
} from '../../src/lib/stripe/config';
import { timingSafeEqualString } from '../../src/lib/public-links/tokens';
import { safeStudioRedirect } from '../../src/lib/auth/redirects';
import { isStudioPrivatePath } from '../../src/lib/studio/private-paths';
import { computeNetPaidMinor, deriveInvoicePaidFields } from '../../src/lib/payments/validation';

const root = process.cwd();
const migrationsDir = path.join(root, 'supabase/migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const allMigrations = migrationFiles
  .map((file) => readFileSync(path.join(migrationsDir, file), 'utf8'))
  .join('\n');

describe('release hardening — auth & surfaces', () => {
  it('disables open signup in local Supabase config', () => {
    const config = readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup\s*=\s*false/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup\s*=\s*false/);
    expect(config).toMatch(/minimum_password_length\s*=\s*12/);
  });

  it('treats Studio API routes as private (session client + no-store)', () => {
    expect(isStudioPrivatePath('/api/studio/invoices/x/pdf')).toBe(true);
    expect(isStudioPrivatePath('/api/studio/health')).toBe(true);
    expect(isStudioPrivatePath('/api/webhooks/stripe')).toBe(false);
    expect(isStudioPrivatePath('/api/contact')).toBe(false);
  });

  it('rejects open redirects', () => {
    expect(safeStudioRedirect('https://evil.example')).toBe('/admin');
    expect(safeStudioRedirect('//evil.example')).toBe('/admin');
    expect(safeStudioRedirect('/admin/clients')).toBe('/admin/clients');
  });

  it('compares cron secrets in constant time for equal lengths', () => {
    expect(timingSafeEqualString('abcdef', 'abcdef')).toBe(true);
    expect(timingSafeEqualString('abcdef', 'abcdeg')).toBe(false);
    expect(timingSafeEqualString('short', 'longer')).toBe(false);
  });
});

describe('release hardening — RLS ledger writes', () => {
  it('ships migration that revokes member write policies on payments/refunds/webhooks', () => {
    expect(migrationFiles).toContain('202608140018_release_hardening.sql');
    const sql = readFileSync(
      path.join(migrationsDir, '202608140018_release_hardening.sql'),
      'utf8',
    );
    expect(sql).toMatch(/DROP POLICY IF EXISTS payments_studio_insert/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS payments_studio_update/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS refunds_studio_insert/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS webhook_events_studio_insert/);
    expect(sql).toMatch(/enforce_invoice_payment_fields_service_only/);
    expect(sql).toMatch(/is_studio_user\(\)/);
    expect(sql).toMatch(/service_role/);
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/);
  });

  it('never grants anon USING \(true\) business policies', () => {
    expect(allMigrations).not.toMatch(/TO anon[\s\S]{0,80}USING\s*\(\s*true\s*\)/i);
  });
});

describe('release hardening — Stripe mode isolation', () => {
  it('detects test vs live prefixes', () => {
    expect(stripeKeyMode('sk_test_abc')).toBe('test');
    expect(stripeKeyMode('pk_live_abc')).toBe('live');
    expect(stripeKeyMode('whsec_abc')).toBe('unknown');
  });

  it('rejects mixed test/live key pairs', () => {
    expect(() =>
      assertStripeKeyModeConsistency({
        STRIPE_SECRET_KEY: 'sk_live_abc',
        PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc',
      }),
    ).toThrow(/mismatch/i);
    expect(() =>
      assertStripeKeyModeConsistency({
        STRIPE_SECRET_KEY: 'sk_test_abc',
        PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_abc',
      }),
    ).not.toThrow();
  });

  it('flags live secret with localhost callbacks', () => {
    expect(
      isDangerousStripeLiveLocalhostCombo({
        secretKey: 'sk_live_abc',
        siteUrl: 'http://localhost:4321',
      }),
    ).toBe(true);
    expect(
      isDangerousStripeLiveLocalhostCombo({
        secretKey: 'sk_test_abc',
        siteUrl: 'http://localhost:4321',
      }),
    ).toBe(false);
  });
});

describe('release hardening — financial property invariants', () => {
  it('deposit + final equals accepted total for many odd-cent cases', () => {
    const amounts = [1, 3, 7, 99, 101, 1001, 10_001, 80_001, 904_001];
    const taxes = [0, 1, 13, 99, 1300, 104_001];
    const bpsList = [0, 1, 2500, 3333, 4000, 5000, 6667, 7500, 9999, 10_000];

    for (const subtotal of amounts) {
      for (const discount of [0, 1, Math.min(subtotal, 50)]) {
        for (const tax of taxes) {
          for (const depositBps of bpsList) {
            const net = Math.max(0, subtotal - discount);
            const total = net + tax;
            const allocation = allocateDepositFinal({
              subtotalMinor: subtotal,
              discountMinor: discount,
              taxMinor: tax,
              totalMinor: total,
              depositBps,
            });
            expect(allocation.depositBaseMinor + allocation.finalBaseMinor).toBe(net);
            expect(allocation.depositTaxMinor + allocation.finalTaxMinor).toBe(tax);
            expect(allocation.depositTotalMinor + allocation.finalTotalMinor).toBe(total);
            expect(balanceDueMinor(total, 0)).toBe(total);
            expect(balanceDueMinor(total, total)).toBe(0);
          }
        }
      }
    }
  });

  it('fails closed on corrupt proposal snapshots', () => {
    expect(() =>
      allocateDepositFinal({
        subtotalMinor: 100,
        discountMinor: 0,
        taxMinor: 13,
        totalMinor: 999,
        depositBps: 5000,
      }),
    ).toThrow(/inconsistent/i);
  });

  it('net paid and balance never go negative', () => {
    expect(
      computeNetPaidMinor([
        { amount_minor: 1000, refunded_minor: 200, status: 'succeeded' },
      ]),
    ).toBe(800);
    expect(
      computeNetPaidMinor([
        { amount_minor: 1000, refunded_minor: 1000, status: 'refunded' },
      ]),
    ).toBe(0);
    const over = deriveInvoicePaidFields({
      totalMinor: 1000,
      netPaidMinor: 1500,
      previousPaidAt: null,
      paymentPaidAt: '2026-01-01T00:00:00Z',
    });
    expect(over.balanceDueMinor).toBe(0);
    expect(over.overpaymentMinor).toBe(500);
  });
});

describe('release hardening — secret leakage guards', () => {
  it('example env file uses placeholders only', () => {
    const example = readFileSync(path.join(root, '.dev.vars.example'), 'utf8');
    expect(example).not.toMatch(/sk_live_/);
    expect(example).not.toMatch(/whsec_[A-Za-z0-9]{16,}/);
    expect(example).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    expect(example).toMatch(/sk_test_xxx|STRIPE_SECRET_KEY=sk_test/);
  });

  it('health route source does not expose secret configuration flags', () => {
    const health = readFileSync(
      path.join(root, 'src/pages/api/studio/health.ts'),
      'utf8',
    );
    expect(health).not.toMatch(/supabaseSecret/);
  });
});
