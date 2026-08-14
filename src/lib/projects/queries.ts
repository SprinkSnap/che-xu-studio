/**
 * Project read queries — user-scoped Supabase + RLS.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { ProjectListQuery } from './validation';
import type {
  ProjectDetail,
  ProjectListItem,
  ProjectListResult,
  ProjectRow,
  StudioSettingsDefaults,
} from './types';
import type { CurrencyCode } from '../supabase/domain';
import { isActiveOperationalStatus, type ProjectStatus } from './workflow';

function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, ' ')
    .replace(/[.()]/g, ' ');
}

export async function getStudioSettingsDefaults(
  supabase: StudioSupabaseClient,
): Promise<StudioSettingsDefaults> {
  const { data } = await supabase
    .from('settings')
    .select('default_currency, default_tax_bps, default_deposit_bps')
    .limit(1)
    .maybeSingle();

  return {
    defaultCurrency: (data?.default_currency as CurrencyCode) || 'CAD',
    defaultTaxBps: data?.default_tax_bps ?? 0,
    defaultDepositBps: data?.default_deposit_bps ?? 5000,
  };
}

export async function listActiveClientsForSelect(
  supabase: StudioSupabaseClient,
): Promise<Array<{ id: string; label: string }>> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name, display_name')
    .eq('status', 'active')
    .order('company_name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.display_name?.trim() || row.company_name,
  }));
}

export async function assertClientAccessible(
  supabase: StudioSupabaseClient,
  clientId: string,
  options?: { allowArchived?: boolean },
): Promise<{ id: string; company_name: string; display_name: string | null; status: string }> {
  let query = supabase
    .from('clients')
    .select('id, company_name, display_name, status')
    .eq('id', clientId);
  if (!options?.allowArchived) {
    query = query.eq('status', 'active');
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('Client not found');
  }
  return data;
}

export async function listProjects(
  supabase: StudioSupabaseClient,
  query: ProjectListQuery,
): Promise<ProjectListResult> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabase.from('projects').select(
    'id, name, project_type, status, project_price_minor, currency, deposit_bps, target_completion_date, updated_at, created_at, client_id, clients!inner(id, company_name, display_name)',
    { count: 'exact' },
  );

  if (query.status === 'operational') {
    builder = builder.in('status', [
      'inquiry',
      'proposal',
      'awaiting_approval',
      'deposit_due',
      'active',
      'awaiting_final_payment',
      'completed',
    ]);
  } else if (query.status !== 'all') {
    builder = builder.eq('status', query.status);
  }

  if (query.clientId) {
    builder = builder.eq('client_id', query.clientId);
  }

  if (query.q) {
    const term = `%${escapeIlike(query.q)}%`;
    const { data: clientMatches } = await supabase
      .from('clients')
      .select('id')
      .or(`company_name.ilike.${term},display_name.ilike.${term}`);
    const clientIds = [...new Set((clientMatches ?? []).map((row) => row.id))];
    if (clientIds.length > 0) {
      builder = builder.or(
        `name.ilike.${term},project_type.ilike.${term},description.ilike.${term},client_id.in.(${clientIds.join(',')})`,
      );
    } else {
      builder = builder.or(
        `name.ilike.${term},project_type.ilike.${term},description.ilike.${term}`,
      );
    }
  }

  switch (query.sort) {
    case 'name_asc':
      builder = builder.order('name', { ascending: true });
      break;
    case 'created_desc':
      builder = builder.order('created_at', { ascending: false });
      break;
    case 'target_date_asc':
      builder = builder.order('target_completion_date', { ascending: true, nullsFirst: false });
      break;
    case 'value_desc':
      builder = builder.order('project_price_minor', { ascending: false });
      break;
    case 'value_asc':
      builder = builder.order('project_price_minor', { ascending: true });
      break;
    case 'updated_desc':
    default:
      builder = builder.order('updated_at', { ascending: false });
      break;
  }

  builder = builder.range(from, to);
  const { data, error, count } = await builder;
  if (error) throw error;

  const items: ProjectListItem[] = (data ?? []).map((row) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    return {
      id: row.id,
      name: row.name,
      projectType: row.project_type,
      status: row.status as ProjectStatus,
      projectPriceMinor: Number(row.project_price_minor),
      currency: row.currency as CurrencyCode,
      depositBps: row.deposit_bps,
      targetCompletionDate: row.target_completion_date,
      updatedAt: row.updated_at,
      clientId: row.client_id,
      clientName:
        (client as { display_name?: string | null; company_name?: string } | null)?.display_name ||
        (client as { company_name?: string } | null)?.company_name ||
        'Client',
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

export async function getProjectById(
  supabase: StudioSupabaseClient,
  projectId: string,
): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProjectDetail(
  supabase: StudioSupabaseClient,
  projectId: string,
): Promise<ProjectDetail | null> {
  const project = await getProjectById(supabase, projectId);
  if (!project) return null;

  const [clientResult, proposalsResult, invoicesResult, activityResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id, company_name, display_name, status')
      .eq('id', project.client_id)
      .maybeSingle(),
    supabase
      .from('proposals')
      .select('id, status, updated_at, current_version_id')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total_minor, currency, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('activity_logs')
      .select('id, action, created_at, metadata')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  if (clientResult.error || !clientResult.data) return null;
  if (proposalsResult.error) throw proposalsResult.error;
  if (invoicesResult.error) throw invoicesResult.error;
  if (activityResult.error) throw activityResult.error;

  return {
    project,
    client: clientResult.data,
    proposals: (proposalsResult.data ?? []).map((row) => ({
      id: row.id,
      title: null,
      status: row.status,
      updated_at: row.updated_at,
    })),
    invoices: invoicesResult.data ?? [],
    activity: (activityResult.data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    })),
  };
}

export { isActiveOperationalStatus };
