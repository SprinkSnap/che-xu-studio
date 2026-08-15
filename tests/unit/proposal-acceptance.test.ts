import { describe, expect, it } from 'vitest';
import {
  generateSecureToken,
  hashPublicToken,
  redactProposalTokenPath,
  timingSafeEqualHex,
  PUBLIC_TOKEN_MIN_LENGTH,
} from '../../src/lib/public-links/tokens';
import {
  canAcceptResolvedProposal,
  canRequestChangesResolvedProposal,
  isProposalCommerciallyExpired,
} from '../../src/lib/public-links/resolve';
import { ACCEPTANCE_TEXT_VERSION } from '../../src/lib/proposals/acceptance';
import { canTransitionProject } from '../../src/lib/projects/workflow';
import { assertPublicSitemapPath } from '../../src/lib/studio/sitemap';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ProposalPublicDocument } from '../../src/lib/public-links/types';

describe('public token security', () => {
  it('generates high-entropy URL-safe tokens', () => {
    const a = generateSecureToken();
    const b = generateSecureToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(PUBLIC_TOKEN_MIN_LENGTH);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically and does not equal plaintext', async () => {
    const token = generateSecureToken();
    const hash1 = await hashPublicToken(token);
    const hash2 = await hashPublicToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(timingSafeEqualHex(hash1, hash2)).toBe(true);
    expect(timingSafeEqualHex(hash1, await hashPublicToken(generateSecureToken()))).toBe(false);
  });

  it('redacts tokens from paths for logs', () => {
    expect(redactProposalTokenPath('/proposal/abcTOKEN123xyz')).toBe('/proposal/[REDACTED]');
    expect(redactProposalTokenPath('/invoice/secretvalue')).toBe('/invoice/[REDACTED]');
  });
});

describe('acceptance gates', () => {
  const baseDoc = {
    link: {
      id: 'l1',
      resource_type: 'proposal' as const,
      resource_id: 'p1',
      proposal_version_id: 'v1',
      token_hash: 'x'.repeat(64),
      expires_at: null,
      revoked_at: null,
      created_at: '2026-01-01T00:00:00Z',
      last_accessed_at: null,
      first_viewed_at: null,
      created_by: null,
    },
    proposal: {
      id: 'p1',
      proposal_number: 'CXS-P-2026-001',
      title: 'Test',
      status: 'viewed',
      expires_at: '2099-01-01T00:00:00Z',
      accepted_at: null,
      client_id: 'c1',
      project_id: 'proj1',
    },
    version: {
      id: 'v1',
      version_number: 1,
      title: 'Test',
      introduction: null,
      project_overview: null,
      objectives: null,
      scope: null,
      deliverables: null,
      timeline: null,
      payment_schedule: null,
      terms_and_conditions: null,
      notes: null,
      subtotal_minor: 800000,
      discount_minor: 0,
      tax_minor: 104000,
      total_minor: 904000,
      currency: 'CAD' as const,
      tax_bps: 1300,
      deposit_bps: 5000,
      is_immutable: true,
      client_display_name: 'Client',
      client_contact_name: null,
      client_contact_email: null,
      project_name: 'Project',
      finalized_at: '2026-01-01T00:00:00Z',
    },
    items: [],
    acceptance: null,
  } satisfies ProposalPublicDocument;

  it('allows accept on valid immutable version', () => {
    expect(canAcceptResolvedProposal(baseDoc)).toBe(true);
    expect(canRequestChangesResolvedProposal(baseDoc)).toBe(true);
  });

  it('blocks accept when expired, accepted, or changes requested', () => {
    expect(
      canAcceptResolvedProposal({
        ...baseDoc,
        proposal: { ...baseDoc.proposal, expires_at: '2020-01-01T00:00:00Z' },
      }),
    ).toBe(false);
    expect(
      canAcceptResolvedProposal({
        ...baseDoc,
        acceptance: {
          id: 'a1',
          accepted_by_name: 'A',
          accepted_by_email: 'a@example.com',
          accepted_at: '2026-01-02T00:00:00Z',
        },
      }),
    ).toBe(false);
    expect(
      canAcceptResolvedProposal({
        ...baseDoc,
        proposal: { ...baseDoc.proposal, status: 'changes_requested' },
      }),
    ).toBe(false);
  });

  it('detects commercial expiration', () => {
    expect(isProposalCommerciallyExpired('2020-01-01T00:00:00Z', new Date('2026-01-01'))).toBe(
      true,
    );
    expect(isProposalCommerciallyExpired('2099-01-01T00:00:00Z', new Date('2026-01-01'))).toBe(
      false,
    );
  });

  it('exports acceptance text version', () => {
    expect(ACCEPTANCE_TEXT_VERSION).toBe('v1');
  });
});

describe('project acceptance transition', () => {
  it('allows proposal and awaiting_approval to deposit_due', () => {
    expect(canTransitionProject('proposal', 'deposit_due')).toBe(true);
    expect(canTransitionProject('awaiting_approval', 'deposit_due')).toBe(true);
    expect(canTransitionProject('active', 'deposit_due')).toBe(false);
  });
});

describe('sitemap privacy', () => {
  it('rejects proposal and invoice paths', () => {
    expect(assertPublicSitemapPath('/proposal/abc')).toBe(false);
    expect(assertPublicSitemapPath('/invoice/abc')).toBe(false);
    expect(assertPublicSitemapPath('/pricing')).toBe(true);
  });
});

describe('phase 10 migration', () => {
  it('adds proposal_version_id and change requests', () => {
    const dir = path.join(process.cwd(), 'supabase/migrations');
    const file = readdirSync(dir).find((name) => name.includes('proposal_public_acceptance'));
    expect(file).toBeTruthy();
    const sql = readFileSync(path.join(dir, file!), 'utf8');
    expect(sql).toContain('proposal_version_id');
    expect(sql).toContain('proposal_change_requests');
    expect(sql).toContain('public_links_active_proposal_version_unique_idx');
    expect(sql).toContain('deposit_due');
  });
});
