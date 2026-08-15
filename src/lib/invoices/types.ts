/**
 * Invoice domain types — Phase 9.
 */

import type { CurrencyCode } from '../supabase/domain';
import type { InvoiceStatus, InvoiceType } from './workflow';

export type InvoiceRow = {
  id: string;
  client_id: string;
  project_id: string | null;
  proposal_id: string | null;
  proposal_version_id: string | null;
  generation_key: string | null;
  invoice_number: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  currency: CurrencyCode;
  issue_date: string | null;
  due_date: string | null;
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  tax_bps: number;
  total_minor: number;
  amount_paid_minor: number;
  balance_due_minor: number;
  payment_instructions: string | null;
  client_display_name: string | null;
  client_contact_name: string | null;
  client_contact_email: string | null;
  client_billing_address: string | null;
  project_name: string | null;
  studio_business_name: string | null;
  studio_billing_email: string | null;
  studio_business_address: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  rate_minor: number;
  amount_minor: number;
  sort_order: number;
  created_at: string;
};

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  displayStatus: string;
  isOverdue: boolean;
  clientId: string;
  clientName: string;
  projectId: string | null;
  projectName: string | null;
  currency: CurrencyCode;
  totalMinor: number;
  balanceDueMinor: number;
  issueDate: string | null;
  dueDate: string | null;
  updatedAt: string;
};

export type InvoiceListResult = {
  items: InvoiceListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type InvoiceDetail = {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  client: { id: string; company_name: string; display_name: string | null };
  project: { id: string; name: string; status: string } | null;
  proposal: { id: string; proposal_number: string; title: string } | null;
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
  displayStatus: string;
  isOverdue: boolean;
};

export type ClientIdentitySnapshot = {
  clientDisplayName: string;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientBillingAddress: string | null;
  projectName: string | null;
  studioBusinessName: string | null;
  studioBillingEmail: string | null;
  studioBusinessAddress: string | null;
};

export const INVOICE_LIST_PAGE_SIZE = 25;
