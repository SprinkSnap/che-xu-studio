/**
 * Invoice read queries — user-scoped Supabase + RLS.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { CurrencyCode } from '../supabase/domain';
import type { InvoiceListQuery } from './validation';
import type {
  InvoiceDetail,
  InvoiceItemRow,
  InvoiceListItem,
  InvoiceListResult,
  InvoiceRow,
} from './types';
import {
  displayInvoiceStatus,
  todayIsoDateUtc,
  type InvoiceStatus,
  type InvoiceType,
} from './workflow';

function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, ' ')
    .replace(/[.()]/g, ' ');
}

export async function listInvoices(
  supabase: StudioSupabaseClient,
  query: InvoiceListQuery,
): Promise<InvoiceListResult> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  const today = todayIsoDateUtc();

  let builder = supabase.from('invoices').select(
    `
      id, invoice_number, invoice_type, status, currency, total_minor, balance_due_minor,
      issue_date, due_date, updated_at, client_id, project_id, client_display_name, project_name,
      clients!inner(id, company_name, display_name),
      projects(id, name)
    `,
    { count: 'exact' },
  );

  if (query.status === 'overdue') {
    builder = builder
      .in('status', ['issued', 'sent', 'partially_paid', 'overdue'])
      .gt('balance_due_minor', 0)
      .lt('due_date', today);
  } else if (query.status !== 'all') {
    builder = builder.eq('status', query.status);
  }

  if (query.type !== 'all') {
    builder = builder.eq('invoice_type', query.type);
  }

  if (query.clientId) {
    builder = builder.eq('client_id', query.clientId);
  }

  if (query.projectId) {
    builder = builder.eq('project_id', query.projectId);
  }

  if (query.q) {
    const term = `%${escapeIlike(query.q)}%`;
    const [{ data: clientMatches }, { data: projectMatches }] = await Promise.all([
      supabase.from('clients').select('id').or(`company_name.ilike.${term},display_name.ilike.${term}`),
      supabase.from('projects').select('id').ilike('name', term),
    ]);
    const clientIds = [...new Set((clientMatches ?? []).map((r) => r.id))];
    const projectIds = [...new Set((projectMatches ?? []).map((r) => r.id))];
    const parts = [
      `invoice_number.ilike.${term}`,
      `client_display_name.ilike.${term}`,
      `project_name.ilike.${term}`,
    ];
    if (clientIds.length) parts.push(`client_id.in.(${clientIds.join(',')})`);
    if (projectIds.length) parts.push(`project_id.in.(${projectIds.join(',')})`);
    builder = builder.or(parts.join(','));
  }

  switch (query.sort) {
    case 'number_asc':
      builder = builder.order('invoice_number', { ascending: true });
      break;
    case 'created_desc':
      builder = builder.order('created_at', { ascending: false });
      break;
    case 'due_asc':
      builder = builder.order('due_date', { ascending: true, nullsFirst: false });
      break;
    case 'total_desc':
      builder = builder.order('total_minor', { ascending: false });
      break;
    case 'balance_desc':
      builder = builder.order('balance_due_minor', { ascending: false });
      break;
    case 'updated_desc':
    default:
      builder = builder.order('updated_at', { ascending: false });
      break;
  }

  const { data, error, count } = await builder.range(from, to);
  if (error) throw error;

  const items: InvoiceListItem[] = (data ?? []).map((row) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const display = displayInvoiceStatus(
      {
        status: row.status,
        due_date: row.due_date,
        balance_due_minor: Number(row.balance_due_minor),
      },
      today,
    );
    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceType: row.invoice_type as InvoiceType,
      status: row.status as InvoiceStatus,
      displayStatus: display.label,
      isOverdue: display.isOverdue,
      clientId: row.client_id,
      clientName:
        row.client_display_name ||
        (client as { display_name?: string | null; company_name?: string } | null)?.display_name ||
        (client as { company_name?: string } | null)?.company_name ||
        'Client',
      projectId: row.project_id,
      projectName:
        row.project_name ||
        (project as { name?: string } | null)?.name ||
        null,
      currency: (row.currency as CurrencyCode) || 'CAD',
      totalMinor: Number(row.total_minor),
      balanceDueMinor: Number(row.balance_due_minor),
      issueDate: row.issue_date,
      dueDate: row.due_date,
      updatedAt: row.updated_at,
    };
  });

  return {
    items,
    total: count ?? items.length,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil((count ?? items.length) / query.pageSize)),
  };
}

export async function getInvoiceById(
  supabase: StudioSupabaseClient,
  invoiceId: string,
): Promise<InvoiceRow | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data as InvoiceRow | null;
}

export async function getInvoiceItems(
  supabase: StudioSupabaseClient,
  invoiceId: string,
): Promise<InvoiceItemRow[]> {
  const { data, error } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as InvoiceItemRow[];
}

export async function getInvoiceDetail(
  supabase: StudioSupabaseClient,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const invoice = await getInvoiceById(supabase, invoiceId);
  if (!invoice) return null;

  const [items, clientResult, projectResult, proposalResult, paymentsResult, activityResult] =
    await Promise.all([
      getInvoiceItems(supabase, invoiceId),
      supabase
        .from('clients')
        .select('id, company_name, display_name')
        .eq('id', invoice.client_id)
        .maybeSingle(),
      invoice.project_id
        ? supabase
            .from('projects')
            .select('id, name, status')
            .eq('id', invoice.project_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      invoice.proposal_id
        ? supabase
            .from('proposals')
            .select('id, proposal_number, title')
            .eq('id', invoice.proposal_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('payments')
        .select('id, amount_minor, currency, status, paid_at, created_at')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('activity_logs')
        .select('id, action, created_at, metadata')
        .eq('subject_id', invoiceId)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

  if (!clientResult.data) return null;
  if (paymentsResult.error) throw paymentsResult.error;
  if (activityResult.error) throw activityResult.error;

  const today = todayIsoDateUtc();
  const display = displayInvoiceStatus(invoice, today);

  return {
    invoice,
    items,
    client: clientResult.data,
    project: projectResult.data,
    proposal: proposalResult.data,
    payments: paymentsResult.data ?? [],
    activity: (activityResult.data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    })),
    displayStatus: display.label,
    isOverdue: display.isOverdue,
  };
}

export async function listInvoicesForClient(
  supabase: StudioSupabaseClient,
  clientId: string,
  limit = 10,
): Promise<
  Array<{
    id: string;
    invoice_number: string;
    invoice_type: string;
    status: string;
    total_minor: number;
    balance_due_minor: number;
    due_date: string | null;
    currency: string;
  }>
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_type, status, total_minor, balance_due_minor, due_date, currency',
    )
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listInvoicesForProposal(
  supabase: StudioSupabaseClient,
  proposalId: string,
): Promise<
  Array<{
    id: string;
    invoice_number: string;
    invoice_type: string;
    status: string;
    total_minor: number;
    balance_due_minor: number;
    currency: string;
  }>
> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, invoice_type, status, total_minor, balance_due_minor, currency',
    )
    .eq('proposal_id', proposalId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getStudioPaymentDefaults(supabase: StudioSupabaseClient): Promise<{
  paymentTermsDays: number;
  defaultTaxBps: number;
  invoicePrefix: string;
}> {
  const { data } = await supabase
    .from('settings')
    .select('payment_terms_days, default_tax_bps, invoice_prefix')
    .limit(1)
    .maybeSingle();
  return {
    paymentTermsDays: data?.payment_terms_days ?? 14,
    defaultTaxBps: data?.default_tax_bps ?? 0,
    invoicePrefix: data?.invoice_prefix || 'CXS',
  };
}
