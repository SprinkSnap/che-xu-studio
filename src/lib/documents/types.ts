/**
 * Shared client-document presentation types (web + PDF).
 * Security boundary: only client-safe fields — no internal notes, tokens, or secrets.
 */

import type { CurrencyCode } from '../supabase/domain';

export type DocumentMoneyLine = {
  label: string;
  amountMinor: number;
};

export type DocumentTableRow = {
  description: string;
  quantityLabel: string;
  rateMinor: number;
  amountMinor: number;
};

export type DocumentSection = {
  heading: string;
  body: string;
};

export type ProposalDocumentViewModel = {
  kind: 'proposal';
  proposalNumber: string;
  versionNumber: number;
  title: string;
  clientDisplayName: string;
  projectName: string;
  sections: DocumentSection[];
  items: DocumentTableRow[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  taxPercentLabel: string;
  currency: CurrencyCode;
  expiresAtLabel: string | null;
  finalizedAtLabel: string | null;
  closingLine: string;
};

export type InvoiceDocumentViewModel = {
  kind: 'invoice';
  invoiceNumber: string;
  invoiceTypeLabel: string;
  /** Issued-snapshot status label (not live paid state for canonical PDF). */
  statusLabel: string;
  clientDisplayName: string;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientBillingAddress: string | null;
  projectName: string | null;
  studioBusinessName: string | null;
  studioBillingEmail: string | null;
  studioBusinessAddress: string | null;
  issueDateLabel: string | null;
  dueDateLabel: string | null;
  items: DocumentTableRow[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  taxPercentLabel: string;
  totalMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  currency: CurrencyCode;
  paymentInstructions: string | null;
  /** Hide interactive Pay CTA in print/PDF. */
  showPayPlaceholder: boolean;
};

export type ReceiptDocumentViewModel = {
  kind: 'receipt';
  title: string;
  invoiceNumber: string;
  paymentReference: string;
  paidAtLabel: string;
  clientDisplayName: string;
  projectName: string | null;
  studioBusinessName: string | null;
  studioBillingEmail: string | null;
  amountReceivedMinor: number;
  invoiceTotalMinor: number;
  balanceDueMinor: number;
  currency: CurrencyCode;
  paymentMethod: string | null;
  fullyPaid: boolean;
  closingLine: string;
};

export const STUDIO_DOCUMENTS_BUCKET = 'studio-documents';
export const RENDERER_VERSION = 'document-v1';
export const PDF_PAGE_SIZE = 'Letter' as const;
export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_EMAIL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
