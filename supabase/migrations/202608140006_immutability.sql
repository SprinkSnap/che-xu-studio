-- Immutability protections for proposal versions and issued invoice snapshots

CREATE OR REPLACE FUNCTION public.enforce_proposal_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_immutable THEN
      RAISE EXCEPTION 'immutable proposal versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.is_immutable THEN
    -- Allow no content mutations once locked (sent/accepted snapshots).
    RAISE EXCEPTION 'immutable proposal versions cannot be updated';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_versions_immutability
  BEFORE UPDATE OR DELETE ON public.proposal_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_proposal_version_immutability();

CREATE OR REPLACE FUNCTION public.enforce_proposal_item_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_immutable boolean;
  v_version_id uuid;
BEGIN
  v_version_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.proposal_version_id ELSE NEW.proposal_version_id END;

  SELECT is_immutable INTO v_immutable
  FROM public.proposal_versions
  WHERE id = v_version_id;

  IF coalesce(v_immutable, false) THEN
    RAISE EXCEPTION 'proposal items on immutable versions cannot be modified';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_items_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_proposal_item_immutability();

-- When a proposal leaves draft into a sent/viewed/accepted state, lock the referenced version.
CREATE OR REPLACE FUNCTION public.lock_proposal_version_on_send()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('sent', 'viewed', 'accepted')
     AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.current_version_id IS DISTINCT FROM OLD.current_version_id)
  THEN
    IF NEW.current_version_id IS NULL THEN
      RAISE EXCEPTION 'cannot mark proposal % as % without current_version_id', NEW.id, NEW.status;
    END IF;

    UPDATE public.proposal_versions
    SET is_immutable = true
    WHERE id = NEW.current_version_id
      AND is_immutable = false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER proposals_lock_version_on_send
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_proposal_version_on_send();

-- Issued invoices: financial snapshot columns + line items locked; payment/status fields remain mutable.
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
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor
     OR NEW.discount_minor IS DISTINCT FROM OLD.discount_minor
     OR NEW.tax_minor IS DISTINCT FROM OLD.tax_minor
     OR NEW.total_minor IS DISTINCT FROM OLD.total_minor
     OR NEW.payment_instructions IS DISTINCT FROM OLD.payment_instructions
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'financial snapshot fields on non-draft invoices cannot be changed';
  END IF;

  -- Mutable after issue: status, amount_paid_minor, balance_due_minor, sent_at, paid_at, voided_at, updated_at
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_financial_immutability
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_financial_immutability();

CREATE OR REPLACE FUNCTION public.enforce_invoice_item_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status public.invoice_status;
  v_invoice_id uuid;
BEGIN
  v_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE COALESCE(NEW.invoice_id, OLD.invoice_id) END;

  SELECT status INTO v_status FROM public.invoices WHERE id = v_invoice_id;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'invoice items on non-draft invoices cannot be modified';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_items_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_item_immutability();

-- Prevent hard-delete of non-draft invoices (preserve financial history)
CREATE OR REPLACE FUNCTION public.prevent_issued_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'non-draft invoices cannot be deleted; void them instead';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER invoices_prevent_issued_delete
  BEFORE DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_issued_invoice_delete();

-- Activity logs are append-only
CREATE OR REPLACE FUNCTION public.prevent_activity_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'activity_logs are append-only';
END;
$$;

CREATE TRIGGER activity_logs_append_only
  BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_activity_log_mutation();
