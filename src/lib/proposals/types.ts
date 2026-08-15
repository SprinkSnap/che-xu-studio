import type { Tables, Enums } from '../supabase/database.types';
import type { CurrencyCode } from '../supabase/domain';
import type { ProposalStatus } from './workflow';

export type ProposalRow = Tables<'proposals'>;
export type ProposalVersionRow = Tables<'proposal_versions'>;
export type ProposalItemRow = Tables<'proposal_items'>;
export type ProposalTemplateRow = Tables<'proposal_templates'>;

export type ProposalItemType = Enums<'proposal_item_type'>;

export type ProposalListItem = {
  id: string;
  proposalNumber: string;
  title: string;
  status: ProposalStatus;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  versionNumber: number | null;
  totalMinor: number;
  currency: CurrencyCode;
  expiresAt: string | null;
  updatedAt: string;
};

export type ProposalListResult = {
  items: ProposalListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ProposalItemForm = {
  id?: string;
  itemType: ProposalItemType;
  description: string;
  quantity: string;
  rate: string;
  optional: boolean;
  selected: boolean;
  sortOrder: number;
};

export type ProposalVersionForm = {
  title: string;
  introduction: string;
  projectOverview: string;
  objectives: string;
  scope: string;
  deliverables: string;
  timeline: string;
  paymentSchedule: string;
  termsAndConditions: string;
  notes: string;
  discount: string;
  taxPercent: string;
  depositPercent: string;
  currency: CurrencyCode;
  expiresAt: string;
  expectedUpdatedAt: string;
  items: ProposalItemForm[];
};

/** Form state for the draft editor (same fields as ProposalVersionForm). */
export type ProposalFormValues = ProposalVersionForm;

export type TemplateFormValues = {
  name: string;
  description: string;
  introduction: string;
  projectOverview: string;
  objectives: string;
  scope: string;
  deliverables: string;
  timeline: string;
  paymentTerms: string;
  termsAndConditions: string;
  notes: string;
  makeDefault: boolean;
};

export type ProposalDetail = {
  proposal: ProposalRow;
  version: ProposalVersionRow;
  items: ProposalItemRow[];
  versions: Array<{
    id: string;
    version_number: number;
    is_immutable: boolean;
    finalized_at: string | null;
    created_at: string;
    total_minor: number;
    currency: string;
  }>;
  client: { id: string; company_name: string; display_name: string | null };
  project: { id: string; name: string; status: string };
  activity: Array<{
    id: string;
    action: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
};

export const PROPOSAL_LIST_PAGE_SIZE = 25;
