/**
 * Receipt presentation view model — successful Payment + Invoice snapshot.
 */

import { formatDateOnly, formatStudioDateTime } from '../clients/format';
import type { CurrencyCode } from '../supabase/domain';
import type { ReceiptDocumentViewModel } from './types';

export function buildReceiptDocumentViewModel(input: {
  invoiceNumber: string;
  paymentId: string;
  paidAt: string | null;
  clientDisplayName: string;
  projectName: string | null;
  studioBusinessName: string | null;
  studioBillingEmail: string | null;
  amountReceivedMinor: number;
  invoiceTotalMinor: number;
  balanceDueMinor: number;
  currency: CurrencyCode;
  paymentMethod: string | null;
}): ReceiptDocumentViewModel {
  const fullyPaid = input.balanceDueMinor <= 0;
  const paidAtLabel = input.paidAt
    ? formatStudioDateTime(input.paidAt)
    : formatDateOnly(new Date().toISOString());
  const shortRef = input.paymentId.replace(/-/g, '').slice(0, 10).toUpperCase();

  return {
    kind: 'receipt',
    title: 'Payment Receipt',
    invoiceNumber: input.invoiceNumber,
    paymentReference: `PAY-${shortRef}`,
    paidAtLabel,
    clientDisplayName: input.clientDisplayName,
    projectName: input.projectName,
    studioBusinessName: input.studioBusinessName,
    studioBillingEmail: input.studioBillingEmail,
    amountReceivedMinor: input.amountReceivedMinor,
    invoiceTotalMinor: input.invoiceTotalMinor,
    balanceDueMinor: input.balanceDueMinor,
    currency: input.currency,
    paymentMethod: input.paymentMethod,
    fullyPaid,
    closingLine: fullyPaid
      ? 'Thank you. This payment has been applied to the invoice. Invoice balance: $0.00 equivalent shown above.'
      : 'Thank you. This receipt confirms a partial payment. Remaining balance is shown above.',
  };
}
