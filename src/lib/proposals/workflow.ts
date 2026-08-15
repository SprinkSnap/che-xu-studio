/**
 * Phase 8 proposal lifecycle helpers.
 *
 * Delivery boundary: Phase 8 may finalize (immutable version) while parent
 * status remains `draft`. Never set status=sent / sent_at without real delivery (Phase 12).
 */

import type { Enums } from '../supabase/database.types';

export type ProposalStatus = Enums<'proposal_status'>;

export const PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'changes_requested',
  'expired',
  'declined',
  'archived',
] as const;

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  accepted: 'Accepted',
  changes_requested: 'Changes Requested',
  expired: 'Expired',
  declined: 'Declined',
  archived: 'Archived',
};

export function isProposalVersionEditable(input: {
  proposalStatus: ProposalStatus;
  versionImmutable: boolean;
}): boolean {
  if (input.proposalStatus === 'archived') return false;
  if (input.proposalStatus === 'accepted') return false;
  return !input.versionImmutable;
}

export function canCreateProposalRevision(input: {
  proposalStatus: ProposalStatus;
  currentVersionImmutable: boolean;
}): boolean {
  if (input.proposalStatus === 'archived') return false;
  if (input.proposalStatus === 'accepted') return false;
  return input.currentVersionImmutable;
}

export function canArchiveProposal(status: ProposalStatus): boolean {
  return status !== 'archived';
}

export function canRestoreProposal(status: ProposalStatus): boolean {
  return status === 'archived';
}

export function canFinalizeProposalVersion(input: {
  proposalStatus: ProposalStatus;
  versionImmutable: boolean;
}): boolean {
  return isProposalVersionEditable(input);
}

export function proposalStatusTone(
  status: ProposalStatus,
): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'sent':
    case 'viewed':
      return 'info';
    case 'changes_requested':
    case 'expired':
    case 'declined':
      return 'warning';
    case 'archived':
      return 'neutral';
    case 'draft':
    default:
      return 'info';
  }
}

/** Phase 8 finalization does not mean client delivery. */
export function phase8FinalizeKeepsDraftStatus(): true {
  return true;
}
