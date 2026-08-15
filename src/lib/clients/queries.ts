/**
 * Client read queries — user-scoped Supabase client + RLS.
 * Avoid N+1: list uses batched financial + contact lookups.
 */

import type { StudioSupabaseClient } from '../supabase/types';
import type { ClientListQuery } from './validation';
import type {
  ClientContactRow,
  ClientDetail,
  ClientListItem,
  ClientListResult,
  ClientRow,
} from './types';

const ACTIVE_PROJECT_STATUSES = [
  'inquiry',
  'proposal',
  'awaiting_approval',
  'deposit_due',
  'active',
  'awaiting_final_payment',
] as const;

function escapeIlike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, ' ')
    .replace(/[.()]/g, ' ');
}

export async function listClients(
  supabase: StudioSupabaseClient,
  query: ClientListQuery,
): Promise<ClientListResult> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let builder = supabase.from('clients').select(
    'id, company_name, display_name, billing_email, status, updated_at',
    { count: 'exact' },
  );

  if (query.status === 'active') {
    builder = builder.eq('status', 'active');
  } else if (query.status === 'archived') {
    builder = builder.eq('status', 'archived');
  }

  if (query.q) {
    const term = `%${escapeIlike(query.q)}%`;
    // Search company, display name, billing email. Primary contact match via contact ids.
    const { data: contactMatches } = await supabase
      .from('client_contacts')
      .select('client_id')
      .or(`name.ilike.${term},email.ilike.${term}`);

    const contactClientIds = [
      ...new Set((contactMatches ?? []).map((row) => row.client_id).filter(Boolean)),
    ];

    if (contactClientIds.length > 0) {
      builder = builder.or(
        `company_name.ilike.${term},display_name.ilike.${term},billing_email.ilike.${term},id.in.(${contactClientIds.join(',')})`,
      );
    } else {
      builder = builder.or(
        `company_name.ilike.${term},display_name.ilike.${term},billing_email.ilike.${term}`,
      );
    }
  }

  // Sort whitelist — never interpolate arbitrary columns.
  switch (query.sort) {
    case 'name_asc':
      builder = builder.order('company_name', { ascending: true });
      break;
    case 'updated_desc':
    default:
      builder = builder.order('updated_at', { ascending: false });
      break;
  }

  // Financial sorts applied after join for small pages; for large sorts we fetch
  // a broader window then sort — Studio scale stays modest. Prefer DB order for name/updated.
  const needsFinancialSort =
    query.sort === 'outstanding_desc' || query.sort === 'lifetime_desc';

  if (needsFinancialSort) {
    // Fetch a bounded set for in-memory financial sort (cap 500).
    builder = builder.order('updated_at', { ascending: false }).range(0, 499);
  } else {
    builder = builder.range(from, to);
  }

  const { data, error, count } = await builder;
  if (error) throw error;

  const rows = data ?? [];
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return {
      items: [],
      total: count ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil((count ?? 0) / query.pageSize)),
    };
  }

  const [contactsResult, financialResult, projectsResult] = await Promise.all([
    supabase
      .from('client_contacts')
      .select('client_id, name, email, is_primary')
      .in('client_id', ids)
      .eq('is_primary', true),
    supabase
      .from('client_financial_summary')
      .select('client_id, lifetime_paid_minor, outstanding_balance_minor')
      .in('client_id', ids),
    supabase
      .from('projects')
      .select('client_id, status')
      .in('client_id', ids)
      .in('status', [...ACTIVE_PROJECT_STATUSES]),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (financialResult.error) throw financialResult.error;
  if (projectsResult.error) throw projectsResult.error;

  const primaryByClient = new Map(
    (contactsResult.data ?? []).map((row) => [row.client_id, row]),
  );
  const financialByClient = new Map(
    (financialResult.data ?? []).map((row) => [row.client_id, row]),
  );
  const projectCounts = new Map<string, number>();
  for (const project of projectsResult.data ?? []) {
    projectCounts.set(project.client_id, (projectCounts.get(project.client_id) ?? 0) + 1);
  }

  let items: ClientListItem[] = rows.map((row) => {
    const primary = primaryByClient.get(row.id);
    const financial = financialByClient.get(row.id);
    return {
      id: row.id,
      companyName: row.company_name,
      displayName: row.display_name,
      status: row.status,
      updatedAt: row.updated_at,
      primaryContactName: primary?.name ?? null,
      primaryContactEmail: primary?.email ?? null,
      billingEmail: row.billing_email,
      activeProjectsCount: projectCounts.get(row.id) ?? 0,
      outstandingBalanceMinor: Number(financial?.outstanding_balance_minor ?? 0),
      lifetimePaidMinor: Number(financial?.lifetime_paid_minor ?? 0),
    };
  });

  if (needsFinancialSort) {
    items.sort((a, b) => {
      if (query.sort === 'outstanding_desc') {
        return b.outstandingBalanceMinor - a.outstandingBalanceMinor;
      }
      return b.lifetimePaidMinor - a.lifetimePaidMinor;
    });
    const total = items.length;
    items = items.slice(from, to + 1);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  return {
    items,
    total: count ?? items.length,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil((count ?? items.length) / query.pageSize)),
  };
}

export async function getClientById(
  supabase: StudioSupabaseClient,
  clientId: string,
): Promise<ClientRow | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getClientDetail(
  supabase: StudioSupabaseClient,
  clientId: string,
): Promise<ClientDetail | null> {
  const client = await getClientById(supabase, clientId);
  if (!client) return null;

  const [
    contactsResult,
    financialResult,
    projectsResult,
    paymentsResult,
    proposalsResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('is_primary', { ascending: false })
      .order('name', { ascending: true }),
    supabase
      .from('client_financial_summary')
      .select('lifetime_paid_minor, outstanding_balance_minor')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('projects')
      .select(
        'id, name, status, project_price_minor, currency, target_completion_date, archived_at, updated_at',
      )
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('payments')
      .select('id, amount_minor, currency, status, paid_at, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('proposals')
      .select(
        `
          id, proposal_number, title, status, project_id, updated_at, current_version_id,
          projects!inner(id, name),
          proposal_versions!proposals_current_version_fk(id, total_minor, currency)
        `,
      )
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('activity_logs')
      .select('id, action, created_at, metadata')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  if (contactsResult.error) throw contactsResult.error;
  if (financialResult.error) throw financialResult.error;
  if (projectsResult.error) throw projectsResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  if (proposalsResult.error) throw proposalsResult.error;
  if (activityResult.error) throw activityResult.error;

  const contacts = (contactsResult.data ?? []) as ClientContactRow[];
  const primaryContact = contacts.find((c) => c.is_primary) ?? null;
  const outstanding = Number(financialResult.data?.outstanding_balance_minor ?? 0);
  const projects = projectsResult.data ?? [];
  const hasActiveProjects = projects.some((p) =>
    (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(p.status),
  );

  const proposals = (proposalsResult.data ?? []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const version = Array.isArray(row.proposal_versions)
      ? row.proposal_versions[0]
      : row.proposal_versions;
    return {
      id: row.id,
      proposal_number: row.proposal_number,
      title: row.title,
      status: row.status,
      project_id: row.project_id,
      project_name: (project as { name?: string } | null)?.name || 'Project',
      total_minor: Number((version as { total_minor?: number } | null)?.total_minor ?? 0),
      currency: (version as { currency?: string } | null)?.currency || 'CAD',
      updated_at: row.updated_at,
    };
  });

  return {
    client,
    contacts,
    primaryContact,
    financial: {
      lifetimePaidMinor: Number(financialResult.data?.lifetime_paid_minor ?? 0),
      outstandingBalanceMinor: outstanding,
    },
    projects,
    payments: paymentsResult.data ?? [],
    proposals,
    activity: (activityResult.data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    })),
    archiveWarnings: {
      hasActiveProjects,
      hasOutstandingBalance: outstanding > 0,
    },
  };
}
