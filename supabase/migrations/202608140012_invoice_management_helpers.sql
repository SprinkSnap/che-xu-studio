-- Phase 9 — Invoice Engine helpers
-- Snapshot identity, generation idempotency, tax_bps for draft recalculation,
-- and lock new snapshot columns after issue.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS proposal_version_id uuid REFERENCES public.proposal_versions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generation_key text,
  ADD COLUMN IF NOT EXISTS tax_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_display_name text,
  ADD COLUMN IF NOT EXISTS client_contact_name text,
  ADD COLUMN IF NOT EXISTS client_contact_email text,
  ADD COLUMN IF NOT EXISTS client_billing_address text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS studio_business_name text,
  ADD COLUMN IF NOT EXISTS studio_billing_email text,
  ADD COLUMN IF NOT EXISTS studio_business_address text;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_tax_bps_non_negative;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_tax_bps_non_negative CHECK (tax_bps >= 0);

COMMENT ON COLUMN public.invoices.generation_key IS
  'Deterministic idempotency key for proposal-derived invoices (e.g. {proposal_version_id}:deposit).';
COMMENT ON COLUMN public.invoices.client_display_name IS
  'Client-facing display name snapshotted at issue (or draft prefill). Historical invoices do not follow live client renames.';
COMMENT ON COLUMN public.invoices.proposal_version_id IS
  'Commercial agreement version used for deposit/final allocation. Prefer over live project price.';

-- Active (non-void) generation keys must be unique so retries cannot double-bill.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_generation_key_active_unique_idx
  ON public.invoices (generation_key)
  WHERE generation_key IS NOT NULL AND status IS DISTINCT FROM 'void';

CREATE INDEX IF NOT EXISTS invoices_proposal_id_idx ON public.invoices (proposal_id);
CREATE INDEX IF NOT EXISTS invoices_proposal_version_id_idx ON public.invoices (proposal_version_id);
CREATE INDEX IF NOT EXISTS invoices_invoice_type_idx ON public.invoices (invoice_type);
CREATE INDEX IF NOT EXISTS invoices_updated_at_idx ON public.invoices (updated_at DESC);

-- Extend financial immutability to snapshot identity columns.
CREATE OR REPLACE FUNCTION public.enforce_invoice_financial_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.proposal_version_id IS DISTINCT FROM OLD.proposal_version_id
     OR NEW.generation_key IS DISTINCT FROM OLD.generation_key
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor
     OR NEW.discount_minor IS DISTINCT FROM OLD.discount_minor
     OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
     OR NEW.tax_bps IS DISTINCT FROM OLD.tax_bps
     OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
     OR NEW.payment_instructions IS DISTINCT FROM OLD.payment_instructions
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.client_display_name IS DISTINCT FROM OLD.client_display_name
     OR NEW.client_contact_name IS DISTINCT FROM OLD.client_contact_name
     OR NEW.client_contact_email IS DISTINCT FROM OLD.client_contact_email
     OR NEW.client_billing_address IS DISTINCT FROM OLD.client_billing_address
     OR NEW.project_name IS DISTINCT FROM OLD.project_name
     OR NEW.studio_business_name IS DISTINCT FROM OLD.studio_business_name
     OR NEW.studio_billing_email IS DISTINCT FROM OLD.studio_billing_email
     OR NEW.studio_business_address IS DISTINCT FROM OLD.studio_business_address
  THEN
    RAISE EXCEPTION 'financial snapshot fields on non-draft invoices cannot be changed';
  END IF;

  -- Mutable after issue: status, amount_paid_minor, balance_due_minor, sent_at, paid_at, voided_at, updated_at
  RETURN NEW;
END;
$$;
