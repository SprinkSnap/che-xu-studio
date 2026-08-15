/**
 * Resolve public proposal capability links (privileged, narrowly scoped).
 */

import type { StudioSupabaseServiceClient } from '../supabase/types';
import { hashPublicToken, PUBLIC_TOKEN_MIN_LENGTH } from './tokens';
import { touchPublicLinkAccess } from './mutations';
import { recordStudioActivity } from '../studio/activity';
import type { ProposalPublicDocument, PublicLinkRow } from './types';

export type ResolveResult =
  | { ok: true; document: ProposalPublicDocument; isFirstView: boolean }
  | { ok: false; reason: 'unavailable' };

/**
 * Resolve a raw token to an exact immutable proposal version.
 * Invalid/revoked/malformed tokens all return the same unavailable result.
 */
export async function resolveProposalPublicLink(
  service: StudioSupabaseServiceClient,
  rawToken: string,
): Promise<ResolveResult> {
  const token = (rawToken ?? '').trim();
  if (token.length < PUBLIC_TOKEN_MIN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, reason: 'unavailable' };
  }

  let tokenHash: string;
  try {
    tokenHash = await hashPublicToken(token);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  const { data: link, error: linkError } = await service
    .from('public_links')
    .select('*')
    .eq('resource_type', 'proposal')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (linkError || !link) {
    return { ok: false, reason: 'unavailable' };
  }

  const linkRow = link as PublicLinkRow;
  if (linkRow.revoked_at) {
    return { ok: false, reason: 'unavailable' };
  }
  if (!linkRow.proposal_version_id) {
    return { ok: false, reason: 'unavailable' };
  }

  const { data: proposal, error: proposalError } = await service
    .from('proposals')
    .select(
      'id, proposal_number, title, status, expires_at, accepted_at, client_id, project_id',
    )
    .eq('id', linkRow.resource_id)
    .maybeSingle();
  if (proposalError || !proposal || proposal.status === 'archived') {
    return { ok: false, reason: 'unavailable' };
  }

  const { data: version, error: versionError } = await service
    .from('proposal_versions')
    .select(
      `id, version_number, title, introduction, project_overview, objectives, scope,
       deliverables, timeline, payment_schedule, terms_and_conditions, notes,
       subtotal_minor, discount_minor, tax_minor, total_minor, currency, tax_bps, deposit_bps,
       is_immutable, client_display_name, client_contact_name, client_contact_email,
       project_name, finalized_at`,
    )
    .eq('id', linkRow.proposal_version_id)
    .eq('proposal_id', proposal.id)
    .maybeSingle();

  if (versionError || !version || !version.is_immutable) {
    return { ok: false, reason: 'unavailable' };
  }

  const { data: items, error: itemsError } = await service
    .from('proposal_items')
    .select(
      'id, description, quantity, rate_minor, amount_minor, sort_order, optional, selected, item_type',
    )
    .eq('proposal_version_id', version.id)
    .order('sort_order', { ascending: true });
  if (itemsError) {
    return { ok: false, reason: 'unavailable' };
  }

  const { data: acceptance } = await service
    .from('proposal_acceptances')
    .select('id, accepted_by_name, accepted_by_email, accepted_at')
    .eq('proposal_version_id', version.id)
    .maybeSingle();

  const isFirstView = !linkRow.first_viewed_at;
  await touchPublicLinkAccess(service, linkRow.id, isFirstView);

  if (isFirstView) {
    await recordStudioActivity(service, {
      actorProfileId: null,
      action: 'proposal.viewed',
      clientId: proposal.client_id,
      projectId: proposal.project_id,
      subjectType: 'proposal',
      subjectId: proposal.id,
      metadata: {
        proposal_version_id: version.id,
        version_number: version.version_number,
        public_link_id: linkRow.id,
      },
    });

    // Soft status: draft/sent → viewed (do not overwrite accepted/changes_requested/expired).
    if (proposal.status === 'draft' || proposal.status === 'sent') {
      await service
        .from('proposals')
        .update({ status: 'viewed' })
        .eq('id', proposal.id)
        .in('status', ['draft', 'sent']);
    }
  }

  return {
    ok: true,
    isFirstView,
    document: {
      link: {
        ...linkRow,
        first_viewed_at: isFirstView ? new Date().toISOString() : linkRow.first_viewed_at,
        last_accessed_at: new Date().toISOString(),
      },
      proposal,
      version: {
        ...version,
        currency: (version.currency as 'CAD' | 'USD') || 'CAD',
      },
      items: items ?? [],
      acceptance: acceptance ?? null,
    },
  };
}

export function isProposalCommerciallyExpired(
  proposalExpiresAt: string | null,
  now = new Date(),
): boolean {
  if (!proposalExpiresAt) return false;
  const expires = new Date(proposalExpiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() < now.getTime();
}

/**
 * Expiration policy (Phase 10):
 * - Link remains viewable until revoked (even after proposal expires).
 * - Acceptance / request-changes disabled after proposal expires_at.
 * - Link expires_at mirrors proposal expires_at for admin display; revocation is hard deny.
 */
export function canAcceptResolvedProposal(document: ProposalPublicDocument, now = new Date()): boolean {
  if (document.acceptance) return false;
  if (document.proposal.status === 'accepted') return false;
  if (document.proposal.status === 'archived') return false;
  if (document.proposal.status === 'changes_requested') return false;
  if (document.link.revoked_at) return false;
  if (isProposalCommerciallyExpired(document.proposal.expires_at, now)) return false;
  return document.version.is_immutable;
}

export function canRequestChangesResolvedProposal(
  document: ProposalPublicDocument,
  now = new Date(),
): boolean {
  if (document.acceptance) return false;
  if (document.proposal.status === 'accepted') return false;
  if (document.proposal.status === 'archived') return false;
  if (document.link.revoked_at) return false;
  if (isProposalCommerciallyExpired(document.proposal.expires_at, now)) return false;
  return document.version.is_immutable;
}
