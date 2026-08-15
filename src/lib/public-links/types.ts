/**
 * Public capability link types — Phase 10.
 */

export type PublicLinkRow = {
  id: string;
  resource_type: 'proposal' | 'invoice' | 'receipt';
  resource_id: string;
  proposal_version_id: string | null;
  token_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  last_accessed_at: string | null;
  first_viewed_at: string | null;
  created_by: string | null;
};

export type ProposalLinkStatus = 'active' | 'viewed' | 'accepted' | 'revoked' | 'expired';

export type InvoicePublicDocument = {
  link: PublicLinkRow;
  invoice: {
    id: string;
    invoice_number: string;
    invoice_type: string;
    status: string;
    currency: 'CAD' | 'USD';
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
    client_id: string;
    project_id: string | null;
    client_display_name: string | null;
    client_contact_name: string | null;
    client_contact_email: string | null;
    client_billing_address: string | null;
    project_name: string | null;
    studio_business_name: string | null;
    studio_billing_email: string | null;
    studio_business_address: string | null;
    paid_at: string | null;
    voided_at: string | null;
    updated_at: string;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    rate_minor: number;
    amount_minor: number;
    sort_order: number;
  }>;
};

export type ProposalPublicDocument = {
  link: PublicLinkRow;
  proposal: {
    id: string;
    proposal_number: string;
    title: string;
    status: string;
    expires_at: string | null;
    accepted_at: string | null;
    client_id: string;
    project_id: string;
  };
  version: {
    id: string;
    version_number: number;
    title: string;
    introduction: string | null;
    project_overview: string | null;
    objectives: string | null;
    scope: string | null;
    deliverables: string | null;
    timeline: string | null;
    payment_schedule: string | null;
    terms_and_conditions: string | null;
    notes: string | null;
    subtotal_minor: number;
    discount_minor: number;
    tax_minor: number;
    total_minor: number;
    currency: 'CAD' | 'USD';
    tax_bps: number;
    deposit_bps: number;
    is_immutable: boolean;
    client_display_name: string | null;
    client_contact_name: string | null;
    client_contact_email: string | null;
    project_name: string | null;
    finalized_at: string | null;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    rate_minor: number;
    amount_minor: number;
    sort_order: number;
    optional: boolean;
    selected: boolean;
    item_type: string;
  }>;
  acceptance: {
    id: string;
    accepted_by_name: string;
    accepted_by_email: string;
    accepted_at: string;
  } | null;
};
