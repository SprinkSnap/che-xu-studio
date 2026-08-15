/**
 * Payment domain types — Phase 11.
 */

import type { CurrencyCode } from '../supabase/domain';

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'partially_refunded'
  | 'refunded'
  | 'canceled';

export type PaymentRow = {
  id: string;
  invoice_id: string;
  client_id: string;
  amount_minor: number;
  currency: CurrencyCode;
  payment_method: string | null;
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_session_id: string | null;
  status: PaymentStatus;
  paid_at: string | null;
  failed_at: string | null;
  refunded_minor: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RefundRow = {
  id: string;
  payment_id: string;
  amount_minor: number;
  currency: CurrencyCode;
  provider_refund_id: string | null;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason: string | null;
  refunded_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PaymentListItem = {
  id: string;
  amountMinor: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  paymentMethod: string | null;
  provider: string;
  paidAt: string | null;
  createdAt: string;
  clientId: string;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  projectId: string | null;
  projectName: string | null;
};

export type PaymentListResult = {
  items: PaymentListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type PaymentDetail = {
  payment: PaymentRow;
  refunds: RefundRow[];
  invoice: {
    id: string;
    invoice_number: string;
    invoice_type: string;
    status: string;
    total_minor: number;
    amount_paid_minor: number;
    balance_due_minor: number;
    currency: CurrencyCode;
  } | null;
  client: { id: string; company_name: string; display_name: string | null } | null;
  project: { id: string; name: string; status: string } | null;
  activity: Array<{ id: string; action: string; created_at: string; metadata: Record<string, unknown> }>;
};

export type ReconcilePaymentResult = {
  paymentId: string;
  paymentCreated: boolean;
  invoiceId: string;
  invoiceStatus: string;
  invoiceType: string;
  projectId: string | null;
  clientId: string;
  amountPaidMinor: number;
  balanceDueMinor: number;
  totalMinor: number;
  paidAt: string | null;
  overpaymentMinor: number;
  anomaly: string | null;
};

export const PAYMENT_LIST_PAGE_SIZE = 25;

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  succeeded: 'Succeeded',
  failed: 'Failed',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  canceled: 'Canceled',
};
