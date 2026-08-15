/**
 * Invoice lifecycle helpers — Phase 9.
 * Sent/paid are not falsely applied before Phase 11/12.
 */

export const INVOICE_STATUSES = [
  'draft',
  'issued',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'refunded',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_TYPES = ['deposit', 'final', 'manual', 'adjustment'] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  sent: 'Sent',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  refunded: 'Refunded',
};

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  deposit: 'Deposit',
  final: 'Final',
  manual: 'Manual',
  adjustment: 'Adjustment',
};

export function invoiceStatusTone(
  status: InvoiceStatus,
  overdue: boolean,
): 'neutral' | 'info' | 'success' | 'warning' {
  if (overdue) return 'warning';
  switch (status) {
    case 'paid':
      return 'success';
    case 'issued':
    case 'sent':
    case 'partially_paid':
      return 'info';
    case 'void':
    case 'refunded':
      return 'neutral';
    case 'draft':
    default:
      return 'neutral';
  }
}

/**
 * Overdue is derived, not an independently mutable source of truth in Phase 9.
 * Conditions: due_date < today (date-only), balance > 0, status open for collection.
 */
export function isInvoiceOverdue(
  invoice: {
    status: InvoiceStatus | string;
    due_date: string | null;
    balance_due_minor: number;
  },
  todayIsoDate: string,
): boolean {
  const status = invoice.status as InvoiceStatus;
  if (status === 'paid' || status === 'void' || status === 'refunded' || status === 'draft') {
    return false;
  }
  if (!['issued', 'sent', 'partially_paid', 'overdue'].includes(status)) {
    return false;
  }
  if (!invoice.due_date || invoice.balance_due_minor <= 0) return false;
  // Date-only ISO comparison avoids browser timezone shifts.
  return invoice.due_date < todayIsoDate;
}

export function displayInvoiceStatus(
  invoice: {
    status: InvoiceStatus | string;
    due_date: string | null;
    balance_due_minor: number;
  },
  todayIsoDate: string,
): { label: string; status: InvoiceStatus; isOverdue: boolean } {
  const status = invoice.status as InvoiceStatus;
  const overdue = isInvoiceOverdue(invoice, todayIsoDate);
  if (overdue) {
    return { label: INVOICE_STATUS_LABELS.overdue, status, isOverdue: true };
  }
  return {
    label: INVOICE_STATUS_LABELS[status] ?? status,
    status,
    isOverdue: false,
  };
}

export function canEditInvoiceFinancials(status: InvoiceStatus | string): boolean {
  return status === 'draft';
}

export function canIssueInvoice(status: InvoiceStatus | string): boolean {
  return status === 'draft';
}

/** Void unpaid issued/sent invoices. Payments/refunds refine this in Phase 11. */
export function canVoidInvoice(invoice: {
  status: InvoiceStatus | string;
  amount_paid_minor: number;
}): boolean {
  const status = invoice.status as InvoiceStatus;
  if (invoice.amount_paid_minor > 0) return false;
  return status === 'issued' || status === 'sent' || status === 'overdue';
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  const utc = Date.UTC(y, m - 1, d + days);
  const date = new Date(utc);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Studio default: deposit due on issue date; final/manual use payment_terms_days. */
export function defaultDueDate(input: {
  invoiceType: InvoiceType;
  issueDate: string;
  paymentTermsDays: number;
}): string {
  if (input.invoiceType === 'deposit') return input.issueDate;
  return addDaysIso(input.issueDate, Math.max(0, input.paymentTermsDays));
}

export function todayIsoDateUtc(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function generationKeyFor(
  proposalVersionId: string,
  invoiceType: 'deposit' | 'final',
): string {
  return `${proposalVersionId}:${invoiceType}`;
}
