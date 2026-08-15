/**
 * Invoice payment eligibility — server-side only.
 */

import type { InvoiceStatus, InvoiceType } from '../invoices/workflow';
import type { CurrencyCode } from '../supabase/domain';

export type PayableInvoice = {
  id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  invoice_type: InvoiceType | string;
  status: InvoiceStatus | string;
  currency: CurrencyCode;
  total_minor: number;
  amount_paid_minor: number;
  balance_due_minor: number;
  updated_at: string;
  client_contact_email?: string | null;
  voided_at?: string | null;
};

const PAYABLE_STATUSES = new Set(['issued', 'sent', 'partially_paid', 'overdue']);

export function isInvoicePayable(invoice: PayableInvoice): boolean {
  if (invoice.voided_at) return false;
  if (invoice.status === 'draft' || invoice.status === 'void' || invoice.status === 'paid') {
    return false;
  }
  if (invoice.status === 'refunded' && invoice.balance_due_minor <= 0) return false;
  if (!PAYABLE_STATUSES.has(invoice.status) && invoice.status !== 'refunded') {
    // refunded with reopened balance is payable
    return false;
  }
  if (invoice.balance_due_minor <= 0) return false;
  if (invoice.currency !== 'CAD' && invoice.currency !== 'USD') return false;
  return true;
}

/** Refunded invoices with positive balance (reopened) are payable. */
export function isInvoicePayableRelaxed(invoice: PayableInvoice): boolean {
  if (invoice.voided_at) return false;
  if (invoice.status === 'draft' || invoice.status === 'void' || invoice.status === 'paid') {
    return false;
  }
  if (invoice.balance_due_minor <= 0) return false;
  if (invoice.currency !== 'CAD' && invoice.currency !== 'USD') return false;
  if (PAYABLE_STATUSES.has(invoice.status)) return true;
  if (invoice.status === 'refunded' && invoice.balance_due_minor > 0) return true;
  return false;
}

export function assertInvoicePayable(invoice: PayableInvoice): void {
  if (!isInvoicePayableRelaxed(invoice)) {
    throw new Error('Invoice is not eligible for payment.');
  }
}

export function publicPaymentStatusFromInvoice(invoice: {
  status: string;
  balance_due_minor: number;
  amount_paid_minor: number;
  total_minor: number;
  currency: CurrencyCode;
  voided_at?: string | null;
}): {
  invoiceStatus: string;
  balanceDueMinor: number;
  amountPaidMinor: number;
  totalMinor: number;
  currency: CurrencyCode;
  paid: boolean;
  payable: boolean;
} {
  const paid = invoice.status === 'paid' && invoice.balance_due_minor === 0;
  return {
    invoiceStatus: invoice.status,
    balanceDueMinor: invoice.balance_due_minor,
    amountPaidMinor: invoice.amount_paid_minor,
    totalMinor: invoice.total_minor,
    currency: invoice.currency,
    paid,
    payable: isInvoicePayableRelaxed({
      id: '',
      client_id: '',
      project_id: null,
      invoice_number: '',
      invoice_type: 'manual',
      status: invoice.status,
      currency: invoice.currency,
      total_minor: invoice.total_minor,
      amount_paid_minor: invoice.amount_paid_minor,
      balance_due_minor: invoice.balance_due_minor,
      updated_at: '',
      voided_at: invoice.voided_at,
    }),
  };
}
