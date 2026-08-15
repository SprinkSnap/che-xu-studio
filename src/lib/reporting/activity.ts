/**
 * Recent payments, paid invoices, activity, and email failure attention.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { CurrencyCode } from '../supabase/domain';
import { humanizeStudioActivity } from '../studio/activity';
import { roleHasPermission, type StudioRole } from '../auth/permissions';
import {
  DASHBOARD_ACTIVITY_ACTIONS,
  RECENT_ACTIVITY_LIMIT,
  RECENT_PAID_INVOICE_LIMIT,
  RECENT_PAYMENT_LIMIT,
} from './definitions';
import type {
  ActivityRow,
  MetricAvailability,
  RecentPaidInvoiceRow,
  RecentPaymentRow,
} from './types';

export async function loadRecentPayments(
  client: StudioSupabaseClient,
): Promise<{ availability: MetricAvailability; items: RecentPaymentRow[] }> {
  try {
    const { data, error } = await client
      .from('payments')
      .select(
        `id, invoice_id, client_id, amount_minor, currency, paid_at, payment_method, status,
         invoices(invoice_number, project_name),
         clients(company_name, display_name)`,
      )
      .eq('status', 'succeeded')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(RECENT_PAYMENT_LIMIT);
    if (error) throw error;

    const items: RecentPaymentRow[] = (data ?? []).map((row) => {
      const invoice = unwrap(row.invoices) as { invoice_number?: string; project_name?: string | null } | null;
      const clientRel = unwrap(row.clients) as {
        company_name?: string;
        display_name?: string | null;
      } | null;
      return {
        paymentId: row.id,
        invoiceId: row.invoice_id,
        invoiceNumber: invoice?.invoice_number || 'Invoice',
        clientId: row.client_id,
        clientName: clientRel?.display_name || clientRel?.company_name || 'Client',
        projectName: invoice?.project_name ?? null,
        amountMinor: row.amount_minor,
        currency: row.currency as CurrencyCode,
        paidAt: row.paid_at as string,
        paymentMethod: row.payment_method,
      };
    });
    return { availability: 'ok', items };
  } catch (error) {
    console.error('[reporting] recent payments failed', error instanceof Error ? error.message : 'error');
    return { availability: 'unavailable', items: [] };
  }
}

export async function loadRecentPaidInvoices(
  client: StudioSupabaseClient,
): Promise<{ availability: MetricAvailability; items: RecentPaidInvoiceRow[] }> {
  try {
    const { data, error } = await client
      .from('invoices')
      .select(
        `id, invoice_number, client_id, total_minor, currency, paid_at, project_name,
         clients(company_name, display_name)`,
      )
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(RECENT_PAID_INVOICE_LIMIT);
    if (error) throw error;

    const items: RecentPaidInvoiceRow[] = (data ?? []).map((row) => {
      const clientRel = unwrap(row.clients) as {
        company_name?: string;
        display_name?: string | null;
      } | null;
      return {
        invoiceId: row.id,
        invoiceNumber: row.invoice_number,
        clientId: row.client_id,
        clientName: clientRel?.display_name || clientRel?.company_name || 'Client',
        projectName: row.project_name,
        totalMinor: row.total_minor,
        currency: row.currency as CurrencyCode,
        paidAt: row.paid_at as string,
      };
    });
    return { availability: 'ok', items };
  } catch (error) {
    console.error(
      '[reporting] recent paid invoices failed',
      error instanceof Error ? error.message : 'error',
    );
    return { availability: 'unavailable', items: [] };
  }
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function activityHref(row: {
  subject_type: string | null;
  subject_id: string | null;
  client_id: string | null;
  project_id: string | null;
  action: string;
}): string | null {
  const type = row.subject_type;
  const id = row.subject_id;
  if (type === 'proposal' && id) return `/admin/proposals/${id}`;
  if (type === 'invoice' && id) return `/admin/invoices/${id}`;
  if (type === 'payment' && id) return `/admin/payments/${id}`;
  if (type === 'project' && id) return `/admin/projects/${id}`;
  if (type === 'client' && id) return `/admin/clients/${id}`;
  if (row.project_id) return `/admin/projects/${row.project_id}`;
  if (row.client_id) return `/admin/clients/${row.client_id}`;
  return null;
}

function activitySummary(row: {
  action: string;
  metadata: unknown;
  subject_type: string | null;
}): string {
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  const client = pick('client_name', 'company_name');
  const number = pick('proposal_number', 'invoice_number', 'project_name');
  if (client && number) return `${client} · ${number}`;
  if (client) return client;
  if (number) return number;
  return humanizeStudioActivity(row.action);
}

export async function loadRecentActivity(
  client: StudioSupabaseClient,
  role: StudioRole,
): Promise<{ availability: MetricAvailability; items: ActivityRow[] }> {
  try {
    let actions = [...DASHBOARD_ACTIVITY_ACTIONS];
    if (!roleHasPermission(role, 'studio.payments.read')) {
      actions = actions.filter(
        (a) => !a.startsWith('payment.') && a !== 'invoice.paid' && a !== 'invoice.partially_paid',
      );
    }
    if (!roleHasPermission(role, 'studio.invoices.read')) {
      actions = actions.filter((a) => !a.startsWith('invoice.'));
    }
    if (!roleHasPermission(role, 'studio.proposals.read')) {
      actions = actions.filter((a) => !a.startsWith('proposal.'));
    }

    const { data, error } = await client
      .from('activity_logs')
      .select('id, action, created_at, client_id, project_id, subject_type, subject_id, metadata')
      .in('action', actions)
      .order('created_at', { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT);
    if (error) throw error;

    const items: ActivityRow[] = (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      label: humanizeStudioActivity(row.action),
      createdAt: row.created_at,
      clientId: row.client_id,
      projectId: row.project_id,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      summary: activitySummary(row),
      href: activityHref(row),
    }));
    return { availability: 'ok', items };
  } catch (error) {
    console.error('[reporting] activity failed', error instanceof Error ? error.message : 'error');
    return { availability: 'unavailable', items: [] };
  }
}

export async function loadRecentEmailFailureCount(
  client: StudioSupabaseClient,
): Promise<{ availability: MetricAvailability; count: number }> {
  try {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { count, error } = await client
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', since);
    if (error) throw error;
    return { availability: 'ok', count: count ?? 0 };
  } catch (error) {
    console.error('[reporting] email failures failed', error instanceof Error ? error.message : 'error');
    return { availability: 'unavailable', count: 0 };
  }
}
