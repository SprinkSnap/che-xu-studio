/**
 * Reporting presentation types — Phase 14.
 */

import type { CurrencyCode } from '../supabase/domain';

export type CurrencyAmount = {
  currency: CurrencyCode;
  amountMinor: number;
};

export type MetricAvailability = 'ok' | 'unavailable' | 'hidden';

export type CurrencyTotals = {
  byCurrency: CurrencyAmount[];
  /** True when more than one currency has a non-zero amount. */
  multiCurrency: boolean;
};

export type OutstandingMetrics = {
  availability: MetricAvailability;
  unpaidCount: number;
  overdueCount: number;
  totals: CurrencyTotals;
  overdueTotals: CurrencyTotals;
};

export type RevenueMetrics = {
  availability: MetricAvailability;
  month: CurrencyTotals;
  year: CurrencyTotals;
  /** Last N months net cash by currency (primary chart series uses default currency). */
  monthlySeries: Array<{ key: string; label: string; byCurrency: CurrencyAmount[] }>;
};

export type ProjectMetrics = {
  availability: MetricAvailability;
  activeCount: number;
};

export type ProposalMetrics = {
  availability: MetricAvailability;
  awaitingApprovalCount: number;
  changesRequestedCount: number;
};

export type DeadlineRow = {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  status: string;
  statusLabel: string;
  targetCompletionDate: string;
  daysUntil: number;
  pastTarget: boolean;
};

export type RecentPaymentRow = {
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  projectName: string | null;
  amountMinor: number;
  currency: CurrencyCode;
  paidAt: string;
  paymentMethod: string | null;
};

export type RecentPaidInvoiceRow = {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  projectName: string | null;
  totalMinor: number;
  currency: CurrencyCode;
  paidAt: string;
};

export type ActivityRow = {
  id: string;
  action: string;
  label: string;
  createdAt: string;
  clientId: string | null;
  projectId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  summary: string;
  href: string | null;
};

export type AttentionItem = {
  kind: 'overdue_invoices' | 'changes_requested' | 'past_deadlines' | 'email_failures';
  label: string;
  detail: string;
  href: string;
  count: number;
};

export type DashboardQuickAction = {
  label: string;
  href: string;
  primary?: boolean;
};

export type DashboardPayload = {
  businessToday: string;
  timeZone: string;
  defaultCurrency: CurrencyCode;
  canViewFinancials: boolean;
  outstanding: OutstandingMetrics;
  revenue: RevenueMetrics;
  projects: ProjectMetrics;
  proposals: ProposalMetrics;
  deadlines: { availability: MetricAvailability; items: DeadlineRow[] };
  recentPayments: { availability: MetricAvailability; items: RecentPaymentRow[] };
  recentPaidInvoices: { availability: MetricAvailability; items: RecentPaidInvoiceRow[] };
  activity: { availability: MetricAvailability; items: ActivityRow[] };
  attention: AttentionItem[];
  quickActions: DashboardQuickAction[];
  emailFailures: { availability: MetricAvailability; count: number };
};
