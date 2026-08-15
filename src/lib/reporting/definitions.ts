/**
 * Canonical reporting metric definitions (Phase 14).
 * Components must not invent alternate formulas.
 */

import type { InvoiceStatus } from '../invoices/workflow';
import type { ProjectStatus } from '../projects/workflow';
import type { ProposalStatus } from '../proposals/workflow';

/** Invoice statuses included in outstanding / unpaid collection totals. */
export const OUTSTANDING_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'issued',
  'sent',
  'partially_paid',
  'overdue',
] as const;

/** Statuses excluded from collection metrics. */
export const NON_COLLECTIBLE_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'draft',
  'paid',
  'void',
  'refunded',
] as const;

/**
 * Outstanding Invoices = sum(balance_due_minor) where balance > 0 and status
 * is in OUTSTANDING_INVOICE_STATUSES. Draft/void/paid excluded.
 */
export const OUTSTANDING_DEFINITION =
  'Sum of balance_due_minor for invoices with balance > 0 and status in issued, sent, partially_paid, overdue.';

/**
 * Unpaid Invoice count = count of invoices with balance_due_minor > 0 and
 * collectible status (includes overdue).
 */
export const UNPAID_COUNT_DEFINITION =
  'Count of collectible invoices with balance_due_minor > 0 (includes overdue).';

/**
 * Overdue = due_date < business_today AND balance_due_minor > 0 AND status
 * collectible (not draft/paid/void/refunded). Derived via isInvoiceOverdue.
 */
export const OVERDUE_DEFINITION =
  'Collectible invoices with due_date before business today and balance_due_minor > 0.';

/**
 * Revenue (cash-event) = sum(succeeded payment amount_minor by paid_at)
 * minus sum(succeeded refund amount_minor by refunded_at) in the period.
 * Not invoice totals or project value.
 */
export const REVENUE_DEFINITION =
  'Net cash revenue: successful payment amounts attributed to paid_at minus successful refund amounts attributed to refunded_at, in Studio business timezone periods.';

/** Active Projects = status exactly `active`. */
export const ACTIVE_PROJECT_STATUSES: readonly ProjectStatus[] = ['active'] as const;

export const ACTIVE_PROJECT_DEFINITION =
  'Count of projects with status = active only (excludes inquiry through deposit_due, awaiting_final_payment, completed, archived).';

/**
 * Proposals awaiting approval = delivered and pending client response.
 * Includes sent + viewed (client opened but has not accepted/requested changes).
 */
export const AWAITING_APPROVAL_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'sent',
  'viewed',
] as const;

export const AWAITING_APPROVAL_DEFINITION =
  'Count of proposals with status sent or viewed (pending client response). Excludes draft, accepted, changes_requested, declined, expired, archived.';

export const CHANGES_REQUESTED_PROPOSAL_STATUSES: readonly ProposalStatus[] = [
  'changes_requested',
] as const;

/** Payment statuses that contribute gross cash received (by paid_at). */
export const REVENUE_PAYMENT_STATUSES = [
  'succeeded',
  'partially_refunded',
  'refunded',
] as const;

/** Refund statuses that reduce net cash (by refunded_at). */
export const REVENUE_REFUND_STATUSES = ['succeeded'] as const;

/** Upcoming deadline window (days ahead from business today). */
export const DEADLINE_LOOKAHEAD_DAYS = 30;

export const DEADLINE_LIST_LIMIT = 8;
export const RECENT_PAYMENT_LIMIT = 8;
export const RECENT_PAID_INVOICE_LIMIT = 8;
export const RECENT_ACTIVITY_LIMIT = 15;
export const REVENUE_CHART_MONTHS = 6;

/**
 * Activity actions shown on the dashboard (human-operational).
 * Technical PDF/link/checkout noise is excluded.
 */
export const DASHBOARD_ACTIVITY_ACTIONS = [
  'client.created',
  'client.archived',
  'client.restored',
  'project.created',
  'project.status_changed',
  'project.archived',
  'project.restored',
  'proposal.sent',
  'proposal.viewed',
  'proposal.accepted',
  'proposal.changes_requested',
  'invoice.issued',
  'invoice.sent',
  'invoice.partially_paid',
  'invoice.paid',
  'invoice.voided',
  'payment.succeeded',
  'payment.refunded',
  'proposal.email_failed',
  'invoice.email_failed',
  'invoice.reminder_failed',
] as const;

export const DEFAULT_REPORTING_TIMEZONE = 'America/Toronto';
export const DEFAULT_REPORTING_CURRENCY = 'CAD' as const;
