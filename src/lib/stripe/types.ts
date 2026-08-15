/**
 * Stripe domain types — Phase 11.
 */

export type StripeCurrency = 'cad' | 'usd';

export type CheckoutSessionCreateResult = {
  sessionId: string;
  url: string;
  amountMinor: number;
  currency: 'CAD' | 'USD';
  reused: boolean;
};

export type StripeCheckoutMetadata = {
  invoice_id: string;
  invoice_number: string;
  client_id: string;
  project_id: string;
  invoice_type: string;
};

export type PublicInvoicePaymentStatus = {
  invoiceStatus: string;
  balanceDueMinor: number;
  amountPaidMinor: number;
  totalMinor: number;
  currency: 'CAD' | 'USD';
  paid: boolean;
  payable: boolean;
};
