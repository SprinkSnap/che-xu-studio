import { describe, expect, it } from 'vitest';
import {
  calculateProposalTotals,
  lineAmountMinor,
  parseQuantityToScaled,
  roundHalfUpMinor,
  depositBaseMinor,
} from '../../src/lib/finance/calculations';
import {
  canCreateProposalRevision,
  isProposalVersionEditable,
  phase8FinalizeKeepsDraftStatus,
} from '../../src/lib/proposals/workflow';
import { proposalListQuerySchema, parseDraftProposalPayload } from '../../src/lib/proposals/validation';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

describe('proposal finance calculations', () => {
  it('computes exact tax after discount', () => {
    const totals = calculateProposalTotals({
      lines: [{ optional: false, selected: true, amountMinor: 800_000 }],
      discountMinor: 50_000,
      taxBps: 1300,
    });
    expect(totals.subtotalMinor).toBe(800_000);
    expect(totals.discountMinor).toBe(50_000);
    expect(totals.taxableBaseMinor).toBe(750_000);
    expect(totals.taxMinor).toBe(97_500);
    expect(totals.totalMinor).toBe(847_500);
  });

  it('excludes unselected optional add-ons from totals', () => {
    const totals = calculateProposalTotals({
      lines: [
        { optional: false, selected: true, amountMinor: 100_000 },
        { optional: true, selected: false, amountMinor: 50_000 },
        { optional: true, selected: true, amountMinor: 25_000 },
      ],
      discountMinor: 0,
      taxBps: 0,
    });
    expect(totals.subtotalMinor).toBe(125_000);
    expect(totals.totalMinor).toBe(125_000);
  });

  it('parses quantity and line amounts without float drift', () => {
    expect(parseQuantityToScaled('1')).toEqual({ ok: true, scaled: 10_000 });
    expect(parseQuantityToScaled('1.5')).toEqual({ ok: true, scaled: 15_000 });
    expect(lineAmountMinor(15_000, 100_00)).toBe(150_00);
    expect(roundHalfUpMinor(0.5)).toBe(1);
    expect(depositBaseMinor(800_000, 5000)).toBe(400_000);
  });

  it('clamps discount to subtotal', () => {
    const totals = calculateProposalTotals({
      lines: [{ optional: false, selected: true, amountMinor: 100 }],
      discountMinor: 500,
      taxBps: 0,
    });
    expect(totals.discountMinor).toBe(100);
    expect(totals.totalMinor).toBe(0);
  });
});

describe('proposal workflow', () => {
  it('treats finalize as draft-preserving', () => {
    expect(phase8FinalizeKeepsDraftStatus()).toBe(true);
  });

  it('blocks edits on immutable or accepted versions', () => {
    expect(
      isProposalVersionEditable({ proposalStatus: 'draft', versionImmutable: true }),
    ).toBe(false);
    expect(
      isProposalVersionEditable({ proposalStatus: 'accepted', versionImmutable: false }),
    ).toBe(false);
    expect(
      canCreateProposalRevision({ proposalStatus: 'draft', currentVersionImmutable: true }),
    ).toBe(true);
    expect(
      canCreateProposalRevision({ proposalStatus: 'draft', currentVersionImmutable: false }),
    ).toBe(false);
  });
});

describe('proposal validation', () => {
  it('whitelists list sort/status', () => {
    const parsed = proposalListQuerySchema.parse({
      q: '  CXS ',
      status: 'draft',
      sort: 'number_asc',
      page: '1',
    });
    expect(parsed.q).toBe('CXS');
    expect(proposalListQuerySchema.safeParse({ sort: 'drop table' }).success).toBe(false);
  });

  it('parses draft payload and recalculates totals server-side', () => {
    const parsed = parseDraftProposalPayload({
      title: 'Website Proposal',
      introduction: 'Hello',
      projectOverview: '',
      objectives: '',
      scope: 'Scope',
      deliverables: 'Site',
      timeline: '',
      paymentSchedule: '50% deposit',
      termsAndConditions: '',
      notes: '',
      discount: '500',
      taxPercent: '13',
      depositPercent: '50',
      currency: 'CAD',
      expiresAt: '2026-12-31',
      expectedUpdatedAt: '2026-08-14T00:00:00.000Z',
      itemsJson: JSON.stringify([
        {
          itemType: 'service',
          description: 'Website',
          quantity: '1',
          rate: '8000.00',
          optional: false,
          selected: true,
          sortOrder: 0,
        },
      ]),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totals.subtotalMinor).toBe(800_000);
      expect(parsed.data.totals.discountMinor).toBe(50_000);
      expect(parsed.data.totals.taxMinor).toBe(97_500);
      expect(parsed.data.totals.totalMinor).toBe(847_500);
    }
  });
});

describe('proposal migration helpers', () => {
  it('ships Phase 8 workflow migration', () => {
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const files = readdirSync(dir);
    expect(files.some((f) => f.includes('proposal_management_helpers'))).toBe(true);
    const sql = readFileSync(
      path.join(dir, files.find((f) => f.includes('proposal_management_helpers'))!),
      'utf8',
    );
    expect(sql).toContain('finalize_proposal_version');
    expect(sql).toContain('create_proposal_revision');
    expect(sql).toContain('set_default_proposal_template');
    expect(sql).toContain('finalized_at');
    expect(sql).toContain('SECURITY INVOKER');
  });
});
