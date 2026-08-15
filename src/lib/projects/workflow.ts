/**
 * Project lifecycle workflow — centralized transition rules.
 * Later phases (proposal acceptance, Stripe) must reuse this service.
 */

import type { Enums } from '../supabase/database.types';

export type ProjectStatus = Enums<'project_status'>;

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'inquiry',
  'proposal',
  'awaiting_approval',
  'deposit_due',
  'active',
  'awaiting_final_payment',
  'completed',
  'archived',
] as const;

/** Human labels for Studio UI. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  awaiting_approval: 'Awaiting Approval',
  deposit_due: 'Deposit Due',
  active: 'Active',
  awaiting_final_payment: 'Awaiting Final Payment',
  completed: 'Completed',
  archived: 'Archived',
};

/**
 * Allowed manual transitions for Phase 7.
 * Automatic transitions reserved for later phases (documented in projects.md):
 * - awaiting_approval → deposit_due (proposal accepted)
 * - deposit_due → active (deposit paid)
 * - active → awaiting_final_payment (final invoice)
 * - awaiting_final_payment → completed (final paid)
 */
const ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  inquiry: ['proposal', 'archived'],
  proposal: ['awaiting_approval', 'deposit_due', 'inquiry', 'archived'],
  awaiting_approval: ['deposit_due', 'proposal', 'archived'],
  deposit_due: ['active', 'archived'],
  active: ['awaiting_final_payment', 'archived'],
  awaiting_final_payment: ['completed', 'active', 'archived'],
  completed: ['archived'],
  // Restore always targets inquiry (documented neutral restore).
  archived: ['inquiry'],
};

export function getAllowedProjectTransitions(
  current: ProjectStatus,
): readonly ProjectStatus[] {
  return ALLOWED_TRANSITIONS[current] ?? [];
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return getAllowedProjectTransitions(from).includes(to);
}

export function assertCanTransitionProject(from: ProjectStatus, to: ProjectStatus): void {
  if (!canTransitionProject(from, to)) {
    throw new Error(`Cannot transition project from ${from} to ${to}`);
  }
}

/** Statuses that should warn before archive. */
export const ARCHIVE_WARNING_STATUSES: readonly ProjectStatus[] = [
  'deposit_due',
  'active',
  'awaiting_final_payment',
] as const;

export function shouldWarnBeforeArchive(status: ProjectStatus): boolean {
  return ARCHIVE_WARNING_STATUSES.includes(status);
}

/** Short action labels for allowed transitions (not a free-form dropdown). */
export function projectTransitionLabel(from: ProjectStatus, to: ProjectStatus): string {
  if (to === 'archived') return 'Archive project';
  if (from === 'archived' && to === 'inquiry') return 'Restore project';
  if (to === 'proposal' && from === 'inquiry') return 'Move to Proposal';
  if (to === 'awaiting_approval') return 'Move to Awaiting Approval';
  if (to === 'deposit_due') return 'Move to Deposit Due';
  if (to === 'active' && from === 'deposit_due') return 'Move to Active';
  if (to === 'active' && from === 'awaiting_final_payment') return 'Return to Active';
  if (to === 'awaiting_final_payment') return 'Move to Awaiting Final Payment';
  if (to === 'completed') return 'Mark Completed';
  if (to === 'inquiry' && from === 'proposal') return 'Return to Inquiry';
  if (to === 'proposal' && from === 'awaiting_approval') return 'Return to Proposal';
  return `Move to ${PROJECT_STATUS_LABELS[to]}`;
}

export function projectStatusTone(
  status: ProjectStatus,
): 'neutral' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'active':
      return 'success';
    case 'deposit_due':
    case 'awaiting_final_payment':
      return 'warning';
    case 'completed':
      return 'info';
    case 'archived':
      return 'neutral';
    default:
      return 'info';
  }
}

export function isActiveOperationalStatus(status: ProjectStatus): boolean {
  return status !== 'completed' && status !== 'archived';
}

export type TransitionSideEffects = {
  completed_at: string | null | undefined;
  archived_at: string | null | undefined;
  status_before_archive: ProjectStatus | null | undefined;
};

/**
 * Compute column side effects for a transition.
 * completed_at is set when entering completed; cleared if leaving completed.
 * archived_at / status_before_archive manage soft archive + restore-to-inquiry.
 */
export function transitionSideEffects(
  from: ProjectStatus,
  to: ProjectStatus,
  nowIso = new Date().toISOString(),
): TransitionSideEffects {
  const effects: TransitionSideEffects = {
    completed_at: undefined,
    archived_at: undefined,
    status_before_archive: undefined,
  };

  if (to === 'completed') {
    effects.completed_at = nowIso;
  } else if (from === 'completed') {
    effects.completed_at = null;
  }

  if (to === 'archived') {
    effects.archived_at = nowIso;
    effects.status_before_archive = from === 'archived' ? null : from;
  } else if (from === 'archived') {
    effects.archived_at = null;
    effects.status_before_archive = null;
  }

  return effects;
}
