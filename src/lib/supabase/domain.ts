import type { Enums, Tables } from './database.types';

export type StudioRole = Enums<'studio_role'>;
export type StudioUserStatus = Enums<'studio_user_status'>;
export type ClientStatus = Enums<'client_status'>;
export type ProjectStatus = Enums<'project_status'>;
export type ProposalStatus = Enums<'proposal_status'>;
export type InvoiceStatus = Enums<'invoice_status'>;
export type InvoiceType = Enums<'invoice_type'>;
export type PaymentStatus = Enums<'payment_status'>;
export type CurrencyCode = Enums<'currency_code'>;

export type Profile = Tables<'profiles'>;
export type Client = Tables<'clients'>;
export type Project = Tables<'projects'>;
export type Proposal = Tables<'proposals'>;
export type ProposalVersion = Tables<'proposal_versions'>;
export type Invoice = Tables<'invoices'>;
export type Payment = Tables<'payments'>;

/** Basis points helpers — 5000 => 50%, 1300 => 13%. */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

/** Format minor units for display (never use for arithmetic persistence). */
export function formatMinorUnits(amountMinor: number, currency: CurrencyCode = 'CAD'): string {
  const major = amountMinor / 100;
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(major);
}
