import type { Tables } from '../supabase/database.types';
import type { ClientStatus } from '../supabase/domain';

export type ClientRow = Tables<'clients'>;
export type ClientContactRow = Tables<'client_contacts'>;
export type ClientFinancialSummaryRow = {
  client_id: string;
  company_name: string;
  lifetime_paid_minor: number;
  outstanding_balance_minor: number;
};

export type ClientListItem = {
  id: string;
  companyName: string;
  displayName: string | null;
  status: ClientStatus;
  updatedAt: string;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  billingEmail: string | null;
  activeProjectsCount: number;
  outstandingBalanceMinor: number;
  lifetimePaidMinor: number;
};

export type ClientListResult = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ClientDetail = {
  client: ClientRow;
  contacts: ClientContactRow[];
  primaryContact: ClientContactRow | null;
  financial: {
    lifetimePaidMinor: number;
    outstandingBalanceMinor: number;
  };
  projects: Array<{
    id: string;
    name: string;
    status: string;
    project_price_minor: number;
    currency: string;
    target_completion_date: string | null;
    archived_at: string | null;
    updated_at: string;
  }>;
  payments: Array<{
    id: string;
    amount_minor: number;
    currency: string;
    status: string;
    paid_at: string | null;
    created_at: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
  archiveWarnings: {
    hasActiveProjects: boolean;
    hasOutstandingBalance: boolean;
  };
};

/** Offset pagination — simple and sufficient for Studio-scale client lists. */
export const CLIENT_LIST_PAGE_SIZE = 25;
