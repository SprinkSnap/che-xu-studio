/**
 * Proposal read queries — user-scoped Supabase + RLS.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { CurrencyCode } from '../supabase/domain';
import type { ProposalListQuery } from './validation';
import type {
  ProposalDetail,
  ProposalListItem,
  ProposalListResult,
  ProposalRow,
  ProposalVersionRow,
  ProposalItemRow,
  ProposalTemplateRow,
} from './types';
import type { ProposalStatus } from './workflow';
import { formatScaledQuantity } from '../finance/calculations';

function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, ' ')
    .replace(/[.()]/g, ' ');
}

export async function listProposals(
  supabase: StudioSupabaseClient,
  query: ProposalListQuery,
): Promise<ProposalListResult> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabase.from('proposals').select(
    `
      id, proposal_number, title, status, expires_at, updated_at, created_at, client_id, project_id, current_version_id,
      clients!inner(id, company_name, display_name),
      projects!inner(id, name),
      proposal_versions!proposals_current_version_fk(id, version_number, total_minor, currency)
    `,
    { count: 'exact' },
  );

  if (query.status === 'active') {
    builder = builder.neq('status', 'archived');
  } else if (query.status !== 'all') {
    builder = builder.eq('status', query.status);
  }

  if (query.clientId) {
    builder = builder.eq('client_id', query.clientId);
  }

  if (query.q) {
    const term = `%${escapeIlike(query.q)}%`;
    const [{ data: clientMatches }, { data: projectMatches }] = await Promise.all([
      supabase.from('clients').select('id').or(`company_name.ilike.${term},display_name.ilike.${term}`),
      supabase.from('projects').select('id').ilike('name', term),
    ]);
    const clientIds = [...new Set((clientMatches ?? []).map((r) => r.id))];
    const projectIds = [...new Set((projectMatches ?? []).map((r) => r.id))];
    const parts = [`proposal_number.ilike.${term}`, `title.ilike.${term}`];
    if (clientIds.length) parts.push(`client_id.in.(${clientIds.join(',')})`);
    if (projectIds.length) parts.push(`project_id.in.(${projectIds.join(',')})`);
    builder = builder.or(parts.join(','));
  }

  switch (query.sort) {
    case 'number_asc':
      builder = builder.order('proposal_number', { ascending: true });
      break;
    case 'created_desc':
      builder = builder.order('created_at', { ascending: false });
      break;
    case 'expires_asc':
      builder = builder.order('expires_at', { ascending: true, nullsFirst: false });
      break;
    case 'value_desc':
      // Fall back to updated — value sort via joined version is unreliable in PostgREST.
      builder = builder.order('updated_at', { ascending: false });
      break;
    case 'updated_desc':
    default:
      builder = builder.order('updated_at', { ascending: false });
      break;
  }

  const { data, error, count } = await builder.range(from, to);
  if (error) throw error;

  let items: ProposalListItem[] = (data ?? []).map((row) => {
    const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const version = Array.isArray(row.proposal_versions)
      ? row.proposal_versions[0]
      : row.proposal_versions;
    return {
      id: row.id,
      proposalNumber: row.proposal_number,
      title: row.title,
      status: row.status as ProposalStatus,
      clientId: row.client_id,
      clientName:
        (client as { display_name?: string | null; company_name?: string } | null)?.display_name ||
        (client as { company_name?: string } | null)?.company_name ||
        'Client',
      projectId: row.project_id,
      projectName: (project as { name?: string } | null)?.name || 'Project',
      versionNumber: (version as { version_number?: number } | null)?.version_number ?? null,
      totalMinor: Number((version as { total_minor?: number } | null)?.total_minor ?? 0),
      currency: ((version as { currency?: string } | null)?.currency as CurrencyCode) || 'CAD',
      expiresAt: row.expires_at,
      updatedAt: row.updated_at,
    };
  });

  if (query.sort === 'value_desc') {
    items = items.sort((a, b) => b.totalMinor - a.totalMinor);
  }

  return {
    items,
    total: count ?? items.length,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil((count ?? items.length) / query.pageSize)),
  };
}

export async function getProposalById(
  supabase: StudioSupabaseClient,
  proposalId: string,
): Promise<ProposalRow | null> {
  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getProposalDetail(
  supabase: StudioSupabaseClient,
  proposalId: string,
): Promise<ProposalDetail | null> {
  const proposal = await getProposalById(supabase, proposalId);
  if (!proposal || !proposal.current_version_id) return null;

  const [versionResult, versionsResult, itemsResult, clientResult, projectResult, activityResult] =
    await Promise.all([
      supabase.from('proposal_versions').select('*').eq('id', proposal.current_version_id).maybeSingle(),
      supabase
        .from('proposal_versions')
        .select('id, version_number, is_immutable, finalized_at, created_at, total_minor, currency')
        .eq('proposal_id', proposalId)
        .order('version_number', { ascending: false }),
      supabase
        .from('proposal_items')
        .select('*')
        .eq('proposal_version_id', proposal.current_version_id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('clients')
        .select('id, company_name, display_name')
        .eq('id', proposal.client_id)
        .maybeSingle(),
      supabase.from('projects').select('id, name, status').eq('id', proposal.project_id).maybeSingle(),
      supabase
        .from('activity_logs')
        .select('id, action, created_at, metadata')
        .eq('subject_id', proposalId)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

  if (versionResult.error || !versionResult.data) return null;
  if (!clientResult.data || !projectResult.data) return null;
  if (versionsResult.error) throw versionsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (activityResult.error) throw activityResult.error;

  return {
    proposal,
    version: versionResult.data,
    items: itemsResult.data ?? [],
    versions: versionsResult.data ?? [],
    client: clientResult.data,
    project: projectResult.data,
    activity: (activityResult.data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    })),
  };
}

export async function getProposalVersionDetail(
  supabase: StudioSupabaseClient,
  proposalId: string,
  versionId: string,
): Promise<{
  proposal: ProposalRow;
  version: ProposalVersionRow;
  items: ProposalItemRow[];
  client: { id: string; company_name: string; display_name: string | null };
  project: { id: string; name: string };
} | null> {
  const proposal = await getProposalById(supabase, proposalId);
  if (!proposal) return null;
  const { data: version, error } = await supabase
    .from('proposal_versions')
    .select('*')
    .eq('id', versionId)
    .eq('proposal_id', proposalId)
    .maybeSingle();
  if (error) throw error;
  if (!version) return null;

  const [itemsResult, clientResult, projectResult] = await Promise.all([
    supabase
      .from('proposal_items')
      .select('*')
      .eq('proposal_version_id', versionId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('clients')
      .select('id, company_name, display_name')
      .eq('id', proposal.client_id)
      .maybeSingle(),
    supabase.from('projects').select('id, name').eq('id', proposal.project_id).maybeSingle(),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (!clientResult.data || !projectResult.data) return null;

  return {
    proposal,
    version,
    items: itemsResult.data ?? [],
    client: clientResult.data,
    project: projectResult.data,
  };
}

export async function listProposalTemplates(
  supabase: StudioSupabaseClient,
  options?: { includeArchived?: boolean },
): Promise<ProposalTemplateRow[]> {
  let builder = supabase.from('proposal_templates').select('*').order('name', { ascending: true });
  if (!options?.includeArchived) builder = builder.eq('is_archived', false);
  const { data, error } = await builder;
  if (error) throw error;
  return data ?? [];
}

export async function getProposalTemplate(
  supabase: StudioSupabaseClient,
  templateId: string,
): Promise<ProposalTemplateRow | null> {
  const { data, error } = await supabase
    .from('proposal_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDefaultProposalTemplate(
  supabase: StudioSupabaseClient,
): Promise<ProposalTemplateRow | null> {
  const { data, error } = await supabase
    .from('proposal_templates')
    .select('*')
    .eq('is_default', true)
    .eq('is_archived', false)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function quantityDisplay(quantity: number | string): string {
  const n = typeof quantity === 'number' ? quantity : Number(quantity);
  if (!Number.isFinite(n)) return String(quantity);
  // Convert numeric quantity to scaled for formatter when it's a plain number.
  const scaled = Math.round(n * 10_000);
  return formatScaledQuantity(scaled);
}
