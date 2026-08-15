import type { Tables } from '../supabase/database.types';
import type { ProjectStatus } from './workflow';
import type { CurrencyCode } from '../supabase/domain';

export type ProjectRow = Tables<'projects'>;

export type ProjectListItem = {
  id: string;
  name: string;
  projectType: string | null;
  status: ProjectStatus;
  projectPriceMinor: number;
  currency: CurrencyCode;
  depositBps: number;
  targetCompletionDate: string | null;
  updatedAt: string;
  clientId: string;
  clientName: string;
};

export type ProjectListResult = {
  items: ProjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ProjectDetail = {
  project: ProjectRow;
  client: {
    id: string;
    company_name: string;
    display_name: string | null;
    status: string;
  };
  proposals: Array<{
    id: string;
    proposal_number: string;
    title: string;
    status: string;
    expires_at: string | null;
    current_version_id: string | null;
    updated_at: string;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    invoice_type: string;
    status: string;
    total_minor: number;
    balance_due_minor: number;
    due_date: string | null;
    currency: string;
    updated_at: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
};

export type StudioSettingsDefaults = {
  defaultCurrency: CurrencyCode;
  defaultTaxBps: number;
  defaultDepositBps: number;
};

export const PROJECT_LIST_PAGE_SIZE = 25;
