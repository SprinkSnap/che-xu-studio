/**
 * Dashboard composition — parallel read-only queries, no external APIs.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { StudioRole } from '../auth/permissions';
import { roleHasPermission } from '../auth/permissions';
import { getStudioSettings } from '../studio/settings';
import type { CurrencyCode } from '../supabase/domain';
import {
  DEFAULT_REPORTING_CURRENCY,
  DEFAULT_REPORTING_TIMEZONE,
} from './definitions';
import { getBusinessToday } from './periods';
import { emptyTotals, loadOutstandingMetrics, loadRevenueMetrics } from './financials';
import {
  loadProjectMetrics,
  loadProposalMetrics,
  loadUpcomingDeadlines,
} from './projects';
import {
  loadRecentActivity,
  loadRecentEmailFailureCount,
  loadRecentPaidInvoices,
  loadRecentPayments,
} from './activity';
import type {
  AttentionItem,
  DashboardPayload,
  DashboardQuickAction,
} from './types';

export async function loadStudioDashboard(
  client: StudioSupabaseClient,
  input: {
    role: StudioRole;
    now?: Date;
  },
): Promise<DashboardPayload> {
  const now = input.now ?? new Date();
  const settings = await getStudioSettings(client);
  const timeZone = settings?.business_timezone || DEFAULT_REPORTING_TIMEZONE;
  const defaultCurrency = (settings?.default_currency ||
    DEFAULT_REPORTING_CURRENCY) as CurrencyCode;
  const businessToday = getBusinessToday(now, timeZone);
  const canViewFinancials = roleHasPermission(input.role, 'studio.payments.read');
  const canViewInvoices = roleHasPermission(input.role, 'studio.invoices.read');

  const [
    outstanding,
    revenue,
    projects,
    proposals,
    deadlines,
    recentPayments,
    recentPaidInvoices,
    activity,
    emailFailures,
  ] = await Promise.all([
    canViewFinancials
      ? loadOutstandingMetrics(client, businessToday)
      : Promise.resolve({
          availability: 'hidden' as const,
          unpaidCount: 0,
          overdueCount: 0,
          totals: emptyTotals(),
          overdueTotals: emptyTotals(),
        }),
    canViewFinancials
      ? loadRevenueMetrics(client, { now, timeZone })
      : Promise.resolve({
          availability: 'hidden' as const,
          month: emptyTotals(),
          year: emptyTotals(),
          monthlySeries: [],
        }),
    loadProjectMetrics(client),
    loadProposalMetrics(client),
    loadUpcomingDeadlines(client, businessToday),
    canViewFinancials
      ? loadRecentPayments(client)
      : Promise.resolve({ availability: 'hidden' as const, items: [] }),
    canViewFinancials
      ? loadRecentPaidInvoices(client)
      : Promise.resolve({ availability: 'hidden' as const, items: [] }),
    loadRecentActivity(client, input.role),
    canViewInvoices
      ? loadRecentEmailFailureCount(client)
      : Promise.resolve({ availability: 'hidden' as const, count: 0 }),
  ]);

  const attention: AttentionItem[] = [];
  if (
    canViewFinancials &&
    outstanding.availability === 'ok' &&
    outstanding.overdueCount > 0
  ) {
    attention.push({
      kind: 'overdue_invoices',
      label: 'Overdue invoices',
      detail: `${outstanding.overdueCount} invoice${outstanding.overdueCount === 1 ? '' : 's'} past due`,
      href: '/admin/invoices?status=overdue',
      count: outstanding.overdueCount,
    });
  }
  if (proposals.availability === 'ok' && proposals.changesRequestedCount > 0) {
    attention.push({
      kind: 'changes_requested',
      label: 'Proposals needing revision',
      detail: `${proposals.changesRequestedCount} with changes requested`,
      href: '/admin/proposals?status=changes_requested',
      count: proposals.changesRequestedCount,
    });
  }
  if (deadlines.availability === 'ok' && deadlines.pastTargetCount > 0) {
    attention.push({
      kind: 'past_deadlines',
      label: 'Projects past target date',
      detail: `${deadlines.pastTargetCount} project${deadlines.pastTargetCount === 1 ? '' : 's'} past target`,
      href: '/admin/projects?status=operational',
      count: deadlines.pastTargetCount,
    });
  }
  if (emailFailures.availability === 'ok' && emailFailures.count > 0) {
    attention.push({
      kind: 'email_failures',
      label: 'Emails need attention',
      detail: `${emailFailures.count} failed in the last 14 days`,
      href: '/admin/settings',
      count: emailFailures.count,
    });
  }

  const quickActions: DashboardQuickAction[] = [];
  if (roleHasPermission(input.role, 'studio.clients.write')) {
    quickActions.push({ label: 'New Client', href: '/admin/clients/new', primary: true });
  }
  if (roleHasPermission(input.role, 'studio.projects.write')) {
    quickActions.push({ label: 'New Project', href: '/admin/projects/new' });
  }
  if (roleHasPermission(input.role, 'studio.proposals.write')) {
    quickActions.push({ label: 'New Proposal', href: '/admin/proposals/new' });
  }
  if (roleHasPermission(input.role, 'studio.invoices.write')) {
    quickActions.push({ label: 'New Invoice', href: '/admin/invoices/new' });
  }

  return {
    businessToday,
    timeZone,
    defaultCurrency,
    canViewFinancials,
    outstanding,
    revenue,
    projects,
    proposals,
    deadlines: { availability: deadlines.availability, items: deadlines.items },
    recentPayments,
    recentPaidInvoices,
    activity,
    attention,
    quickActions,
    emailFailures,
  };
}
