/**
 * Admin payment queries — authenticated user client + RLS.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { CurrencyCode } from '../supabase/domain';
import {
  PAYMENT_LIST_PAGE_SIZE,
  type PaymentDetail,
  type PaymentListResult,
  type PaymentRow,
  type PaymentStatus,
  type RefundRow,
} from './types';

export async function listPayments(
  supabase: StudioSupabaseClient,
  options: { page?: number; pageSize?: number; status?: string | null } = {},
): Promise<PaymentListResult> {
  const pageSize = options.pageSize ?? PAYMENT_LIST_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (options.status) {
    query = query.eq(
      'status',
      options.status as
        | 'pending'
        | 'succeeded'
        | 'failed'
        | 'partially_refunded'
        | 'refunded'
        | 'canceled',
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const invoiceIds = [...new Set(rows.map((r) => r.invoice_id))];

  const [clientsResult, invoicesResult] = await Promise.all([
    clientIds.length
      ? supabase.from('clients').select('id, company_name, display_name').in('id', clientIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? supabase
          .from('invoices')
          .select('id, invoice_number, project_id, project_name')
          .in('id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (clientsResult.error) throw clientsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;

  const clientsById = new Map((clientsResult.data ?? []).map((c) => [c.id, c]));
  const invoicesById = new Map((invoicesResult.data ?? []).map((i) => [i.id, i]));
  const projectIds = [
    ...new Set(
      (invoicesResult.data ?? [])
        .map((i) => i.project_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const projectsResult = projectIds.length
    ? await supabase.from('projects').select('id, name').in('id', projectIds)
    : { data: [], error: null };
  if (projectsResult.error) throw projectsResult.error;
  const projectsById = new Map((projectsResult.data ?? []).map((p) => [p.id, p]));

  const items = rows.map((row) => {
    const client = clientsById.get(row.client_id);
    const invoice = invoicesById.get(row.invoice_id);
    const project = invoice?.project_id ? projectsById.get(invoice.project_id) : null;
    return {
      id: row.id,
      amountMinor: row.amount_minor,
      currency: row.currency as CurrencyCode,
      status: row.status as PaymentStatus,
      paymentMethod: row.payment_method,
      provider: row.provider,
      paidAt: row.paid_at,
      createdAt: row.created_at,
      clientId: row.client_id,
      clientName: client?.display_name || client?.company_name || 'Client',
      invoiceId: row.invoice_id,
      invoiceNumber: invoice?.invoice_number || '—',
      projectId: project?.id ?? invoice?.project_id ?? null,
      projectName: project?.name ?? invoice?.project_name ?? null,
    };
  });

  const total = count ?? 0;
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPaymentDetail(
  supabase: StudioSupabaseClient,
  paymentId: string,
): Promise<PaymentDetail | null> {
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!payment) return null;

  const [refundsResult, invoiceResult, clientResult, activityResult] = await Promise.all([
    supabase
      .from('refunds')
      .select('*')
      .eq('payment_id', paymentId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select(
        'id, invoice_number, invoice_type, status, total_minor, amount_paid_minor, balance_due_minor, currency, project_id',
      )
      .eq('id', payment.invoice_id)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, company_name, display_name')
      .eq('id', payment.client_id)
      .maybeSingle(),
    supabase
      .from('activity_logs')
      .select('id, action, created_at, metadata')
      .or(`subject_id.eq.${paymentId}`)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  if (refundsResult.error) throw refundsResult.error;
  if (invoiceResult.error) throw invoiceResult.error;
  if (clientResult.error) throw clientResult.error;
  if (activityResult.error) throw activityResult.error;

  let project: { id: string; name: string; status: string } | null = null;
  const projectId = invoiceResult.data?.project_id;
  if (projectId) {
    const { data: projectRow } = await supabase
      .from('projects')
      .select('id, name, status')
      .eq('id', projectId)
      .maybeSingle();
    project = projectRow ?? null;
  }

  return {
    payment: {
      ...payment,
      metadata: (payment.metadata ?? {}) as Record<string, unknown>,
    } as PaymentRow,
    refunds: (refundsResult.data ?? []).map((r) => ({
      ...r,
      metadata: (r.metadata ?? {}) as Record<string, unknown>,
    })) as RefundRow[],
    invoice: invoiceResult.data
      ? {
          id: invoiceResult.data.id,
          invoice_number: invoiceResult.data.invoice_number,
          invoice_type: invoiceResult.data.invoice_type,
          status: invoiceResult.data.status,
          total_minor: invoiceResult.data.total_minor,
          amount_paid_minor: invoiceResult.data.amount_paid_minor,
          balance_due_minor: invoiceResult.data.balance_due_minor,
          currency: invoiceResult.data.currency as CurrencyCode,
        }
      : null,
    client: clientResult.data,
    project,
    activity: (activityResult.data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    })),
  };
}
