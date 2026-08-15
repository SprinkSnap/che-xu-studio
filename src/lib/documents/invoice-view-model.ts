/**
 * Invoice presentation view model — issued Invoice snapshot only.
 */

import { formatDateOnly } from '../clients/format';
import { formatScaledQuantity } from '../finance/calculations';
import { bpsToPercentInput } from '../money/parse';
import type { CurrencyCode } from '../supabase/domain';
import type { InvoiceItemRow } from '../invoices/types';
import { INVOICE_TYPE_LABELS, type InvoiceType } from '../invoices/workflow';
import type { InvoiceDocumentViewModel } from './types';

export function buildInvoiceDocumentViewModel(input: {
  invoiceNumber: string;
  invoiceType: InvoiceType | string;
  /** For canonical PDF use issued-time label (e.g. Issued), not live Paid. */
  statusLabel: string;
  clientDisplayName: string;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientBillingAddress: string | null;
  projectName: string | null;
  studioBusinessName: string | null;
  studioBillingEmail: string | null;
  studioBusinessAddress: string | null;
  issueDate: string | null;
  dueDate: string | null;
  items: InvoiceItemRow[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  taxBps: number;
  totalMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  currency: CurrencyCode;
  paymentInstructions: string | null;
  showPayPlaceholder?: boolean;
}): InvoiceDocumentViewModel {
  const typeKey = input.invoiceType as InvoiceType;
  return {
    kind: 'invoice',
    invoiceNumber: input.invoiceNumber,
    invoiceTypeLabel: INVOICE_TYPE_LABELS[typeKey] || String(input.invoiceType),
    statusLabel: input.statusLabel,
    clientDisplayName: input.clientDisplayName,
    clientContactName: input.clientContactName,
    clientContactEmail: input.clientContactEmail,
    clientBillingAddress: input.clientBillingAddress,
    projectName: input.projectName,
    studioBusinessName: input.studioBusinessName,
    studioBillingEmail: input.studioBillingEmail,
    studioBusinessAddress: input.studioBusinessAddress,
    issueDateLabel: input.issueDate ? formatDateOnly(input.issueDate) : null,
    dueDateLabel: input.dueDate ? formatDateOnly(input.dueDate) : null,
    items: input.items.map((item) => ({
      description: item.description,
      quantityLabel: formatScaledQuantity(Math.round(Number(item.quantity) * 10_000)),
      rateMinor: item.rate_minor,
      amountMinor: item.amount_minor,
    })),
    subtotalMinor: input.subtotalMinor,
    discountMinor: input.discountMinor,
    taxMinor: input.taxMinor,
    taxPercentLabel: bpsToPercentInput(input.taxBps),
    totalMinor: input.totalMinor,
    amountPaidMinor: input.amountPaidMinor,
    balanceDueMinor: input.balanceDueMinor,
    currency: input.currency,
    paymentInstructions: input.paymentInstructions,
    showPayPlaceholder: input.showPayPlaceholder ?? false,
  };
}
