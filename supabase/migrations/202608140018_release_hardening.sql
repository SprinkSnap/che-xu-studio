-- Phase 15 — Release hardening
-- 1) next_document_number requires Studio membership (or service_role)
-- 2) Ledger writes (payments/refunds/webhook_events) are service_role-only via RLS
-- 3) Invoice paid/balance fields mutable only by service_role after issue
-- 4) client_financial_summary outstanding aligns with dashboard (balance > 0)

-- ---------------------------------------------------------------------------
-- next_document_number: require Studio membership (or service_role)
-- Authenticated non-members must not allocate proposal/invoice numbers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_document_number(
  p_counter_type public.number_counter_type,
  p_prefix text,
  p_year integer DEFAULT EXTRACT(YEAR FROM now())::integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_prefix text := trim(p_prefix);
  v_is_service boolean := (auth.role() = 'service_role');
BEGIN
  IF NOT v_is_service AND NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized to allocate document numbers';
  END IF;

  IF v_prefix IS NULL OR length(v_prefix) = 0 THEN
    RAISE EXCEPTION 'document prefix is required';
  END IF;
  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'document year out of range: %', p_year;
  END IF;

  INSERT INTO public.number_counters (counter_type, year, prefix, current_value)
  VALUES (p_counter_type, p_year, v_prefix, 0)
  ON CONFLICT (counter_type, year, prefix) DO NOTHING;

  UPDATE public.number_counters
  SET current_value = current_value + 1,
      updated_at = now()
  WHERE counter_type = p_counter_type
    AND year = p_year
    AND prefix = v_prefix
  RETURNING current_value INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'failed to allocate document number';
  END IF;

  RETURN v_prefix || '-' || p_year::text || '-' || lpad(v_next::text, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.next_document_number(public.number_counter_type, text, integer) IS
  'SECURITY DEFINER atomic allocator. Requires is_studio_user() or service_role. Fixed search_path.';

-- ---------------------------------------------------------------------------
-- Payments / refunds / webhook_events: Studio members may SELECT only.
-- Stripe reconciliation uses service_role (bypasses RLS) + SECURITY DEFINER RPCs.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payments_studio_insert ON public.payments;
DROP POLICY IF EXISTS payments_studio_update ON public.payments;

DROP POLICY IF EXISTS refunds_studio_insert ON public.refunds;
DROP POLICY IF EXISTS refunds_studio_update ON public.refunds;

DROP POLICY IF EXISTS webhook_events_studio_insert ON public.webhook_events;
DROP POLICY IF EXISTS webhook_events_studio_update ON public.webhook_events;

COMMENT ON TABLE public.payments IS
  'Stripe-reconciled payment ledger. SELECT for studio members; writes via service_role only.';
COMMENT ON TABLE public.refunds IS
  'Stripe-reconciled refund ledger. SELECT for studio members; writes via service_role only.';
COMMENT ON TABLE public.webhook_events IS
  'Provider webhook idempotency ledger. Admin SELECT; writes via service_role only.';

-- ---------------------------------------------------------------------------
-- After issue, only service_role may mutate payment aggregates on invoices.
-- Status / sent / void timestamps remain editable by studio users via app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_fields_service_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.amount_paid_minor IS DISTINCT FROM OLD.amount_paid_minor
     OR NEW.balance_due_minor IS DISTINCT FROM OLD.balance_due_minor
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
  THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'invoice payment fields may only be updated by service_role reconciliation'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_payment_fields_service_only ON public.invoices;
CREATE TRIGGER invoices_payment_fields_service_only
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_payment_fields_service_only();

COMMENT ON FUNCTION public.enforce_invoice_payment_fields_service_only() IS
  'Blocks PostgREST forgery of amount_paid_minor / balance_due_minor / paid_at after issue.';

-- ---------------------------------------------------------------------------
-- Align client_financial_summary outstanding with dashboard (balance > 0)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.client_financial_summary
WITH (security_invoker = true)
AS
SELECT
  c.id AS client_id,
  c.company_name,
  coalesce((
    SELECT sum(p.amount_minor - p.refunded_minor)
    FROM public.payments p
    WHERE p.client_id = c.id
      AND p.status IN ('succeeded', 'partially_refunded', 'refunded')
  ), 0)::bigint AS lifetime_paid_minor,
  coalesce((
    SELECT sum(i.balance_due_minor)
    FROM public.invoices i
    WHERE i.client_id = c.id
      AND i.balance_due_minor > 0
      AND i.status IN ('issued', 'sent', 'partially_paid', 'overdue')
  ), 0)::bigint AS outstanding_balance_minor
FROM public.clients c;

COMMENT ON VIEW public.client_financial_summary IS
  'Per-client aggregates. lifetime_paid_minor = net succeeded payments. outstanding_balance_minor = sum of positive balances on collectible invoices (excludes draft/void/paid).';
