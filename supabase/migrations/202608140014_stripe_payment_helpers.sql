-- Phase 11 — Stripe payment helpers
-- Invoice capability links, checkout session tracking, payment uniqueness,
-- and SECURITY DEFINER reconciliation RPCs (service_role only).

-- ---------------------------------------------------------------------------
-- One active client Invoice capability link at a time
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS public_links_active_invoice_unique_idx
  ON public.public_links (resource_id)
  WHERE resource_type = 'invoice' AND revoked_at IS NULL;

COMMENT ON INDEX public.public_links_active_invoice_unique_idx IS
  'At most one active (non-revoked) Invoice capability link per invoice.';

-- ---------------------------------------------------------------------------
-- Checkout session uniqueness on Payment rows (when recorded)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_checkout_session_id_unique_idx
  ON public.payments (provider_checkout_session_id)
  WHERE provider_checkout_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Checkout attempt tracking (not financial truth — abandoned sessions OK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  provider_session_id text NOT NULL,
  amount_minor bigint NOT NULL,
  currency public.currency_code NOT NULL,
  status text NOT NULL DEFAULT 'open',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_checkout_sessions_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT invoice_checkout_sessions_provider_session_unique UNIQUE (provider_session_id),
  CONSTRAINT invoice_checkout_sessions_status_check CHECK (
    status IN ('open', 'completed', 'expired', 'canceled')
  )
);

CREATE TRIGGER invoice_checkout_sessions_set_updated_at
  BEFORE UPDATE ON public.invoice_checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS invoice_checkout_sessions_invoice_id_idx
  ON public.invoice_checkout_sessions (invoice_id);

CREATE INDEX IF NOT EXISTS invoice_checkout_sessions_invoice_open_idx
  ON public.invoice_checkout_sessions (invoice_id)
  WHERE status = 'open';

COMMENT ON TABLE public.invoice_checkout_sessions IS
  'Stripe Checkout Session attempts for Invoice payment. Not a Payment ledger row.';

ALTER TABLE public.invoice_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_checkout_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_checkout_sessions_studio_select
  ON public.invoice_checkout_sessions FOR SELECT TO authenticated
  USING (public.is_studio_user());

CREATE POLICY invoice_checkout_sessions_studio_write
  ON public.invoice_checkout_sessions FOR ALL TO authenticated
  USING (public.is_studio_user())
  WITH CHECK (public.is_studio_user());

GRANT SELECT, INSERT, UPDATE ON public.invoice_checkout_sessions TO authenticated;
GRANT ALL ON public.invoice_checkout_sessions TO service_role;

-- ---------------------------------------------------------------------------
-- Apply succeeded Stripe payment (idempotent upsert + invoice recompute)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_succeeded_stripe_payment(
  p_invoice_id uuid,
  p_client_id uuid,
  p_amount_minor bigint,
  p_currency public.currency_code,
  p_provider_payment_id text,
  p_provider_checkout_session_id text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_net_paid bigint;
  v_amount_paid bigint;
  v_balance bigint;
  v_overpayment bigint := 0;
  v_new_status public.invoice_status;
  v_paid_at timestamptz;
  v_created boolean := false;
  v_anomaly text := NULL;
BEGIN
  IF p_provider_payment_id IS NULL OR length(trim(p_provider_payment_id)) = 0 THEN
    RAISE EXCEPTION 'provider_payment_id required';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be positive';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  IF v_invoice.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'invoice client mismatch';
  END IF;

  IF v_invoice.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'currency mismatch';
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'invoice is void';
  END IF;

  IF v_invoice.status = 'draft' THEN
    RAISE EXCEPTION 'invoice is draft';
  END IF;

  -- Idempotent: existing provider payment
  SELECT * INTO v_existing
  FROM public.payments
  WHERE provider_payment_id = p_provider_payment_id
  FOR UPDATE;

  IF FOUND THEN
    v_payment := v_existing;
  ELSE
    INSERT INTO public.payments (
      invoice_id,
      client_id,
      amount_minor,
      currency,
      payment_method,
      provider,
      provider_payment_id,
      provider_checkout_session_id,
      status,
      paid_at,
      metadata
    ) VALUES (
      p_invoice_id,
      p_client_id,
      p_amount_minor,
      p_currency,
      p_payment_method,
      'stripe',
      p_provider_payment_id,
      p_provider_checkout_session_id,
      'succeeded',
      coalesce(p_paid_at, now()),
      coalesce(p_metadata, '{}'::jsonb)
    )
    RETURNING * INTO v_payment;
    v_created := true;
  END IF;

  -- Mark matching checkout attempt completed
  IF p_provider_checkout_session_id IS NOT NULL THEN
    UPDATE public.invoice_checkout_sessions
    SET status = 'completed'
    WHERE provider_session_id = p_provider_checkout_session_id
      AND status = 'open';
  END IF;

  SELECT coalesce(sum(greatest(p.amount_minor - p.refunded_minor, 0)), 0)
  INTO v_net_paid
  FROM public.payments p
  WHERE p.invoice_id = p_invoice_id
    AND p.status IN ('succeeded', 'partially_refunded', 'refunded');

  IF v_net_paid > v_invoice.total_minor THEN
    v_overpayment := v_net_paid - v_invoice.total_minor;
    v_anomaly := 'overpayment';
  END IF;

  v_amount_paid := least(v_net_paid, v_invoice.total_minor);
  v_balance := v_invoice.total_minor - v_amount_paid;

  IF v_amount_paid <= 0 THEN
    v_new_status := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.invoice_id = p_invoice_id
          AND p.status IN ('succeeded', 'partially_refunded', 'refunded')
      ) THEN 'refunded'::public.invoice_status
      ELSE v_invoice.status
    END;
    v_paid_at := NULL;
  ELSIF v_balance > 0 THEN
    v_new_status := 'partially_paid';
    v_paid_at := v_invoice.paid_at; -- keep null until fully paid
  ELSE
    v_new_status := 'paid';
    v_paid_at := coalesce(v_invoice.paid_at, coalesce(p_paid_at, now()));
  END IF;

  UPDATE public.invoices
  SET
    amount_paid_minor = v_amount_paid,
    balance_due_minor = v_balance,
    status = v_new_status,
    paid_at = v_paid_at,
    updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'payment_created', v_created,
    'invoice_id', v_invoice.id,
    'invoice_status', v_invoice.status,
    'invoice_type', v_invoice.invoice_type,
    'project_id', v_invoice.project_id,
    'client_id', v_invoice.client_id,
    'amount_paid_minor', v_invoice.amount_paid_minor,
    'balance_due_minor', v_invoice.balance_due_minor,
    'total_minor', v_invoice.total_minor,
    'paid_at', v_invoice.paid_at,
    'overpayment_minor', v_overpayment,
    'anomaly', v_anomaly
  );
END;
$$;

COMMENT ON FUNCTION public.apply_succeeded_stripe_payment IS
  'Idempotent Stripe payment upsert + Invoice balance/status recompute. Service role only.';

REVOKE ALL ON FUNCTION public.apply_succeeded_stripe_payment(
  uuid, uuid, bigint, public.currency_code, text, text, text, timestamptz, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_succeeded_stripe_payment(
  uuid, uuid, bigint, public.currency_code, text, text, text, timestamptz, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_succeeded_stripe_payment(
  uuid, uuid, bigint, public.currency_code, text, text, text, timestamptz, jsonb
) TO service_role;

-- ---------------------------------------------------------------------------
-- Apply succeeded Stripe refund (idempotent + invoice recompute)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_succeeded_stripe_refund(
  p_provider_refund_id text,
  p_provider_payment_id text,
  p_amount_minor bigint,
  p_currency public.currency_code,
  p_refunded_at timestamptz DEFAULT now(),
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_created boolean := false;
  v_new_refunded bigint;
  v_payment_status public.payment_status;
  v_net_paid bigint;
  v_amount_paid bigint;
  v_balance bigint;
  v_overpayment bigint := 0;
  v_new_status public.invoice_status;
  v_anomaly text := NULL;
BEGIN
  IF p_provider_refund_id IS NULL OR length(trim(p_provider_refund_id)) = 0 THEN
    RAISE EXCEPTION 'provider_refund_id required';
  END IF;
  IF p_provider_payment_id IS NULL OR length(trim(p_provider_payment_id)) = 0 THEN
    RAISE EXCEPTION 'provider_payment_id required';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'amount_minor must be positive';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE provider_payment_id = p_provider_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found for refund';
  END IF;

  IF v_payment.currency IS DISTINCT FROM p_currency THEN
    RAISE EXCEPTION 'refund currency mismatch';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE provider_refund_id = p_provider_refund_id
  FOR UPDATE;

  IF FOUND THEN
    -- Already recorded — still recompute invoice for safety
    NULL;
  ELSE
    v_new_refunded := v_payment.refunded_minor + p_amount_minor;
    IF v_new_refunded > v_payment.amount_minor THEN
      RAISE EXCEPTION 'refund exceeds payment amount';
    END IF;

    INSERT INTO public.refunds (
      payment_id,
      amount_minor,
      currency,
      provider_refund_id,
      status,
      reason,
      refunded_at,
      metadata
    ) VALUES (
      v_payment.id,
      p_amount_minor,
      p_currency,
      p_provider_refund_id,
      'succeeded',
      p_reason,
      coalesce(p_refunded_at, now()),
      coalesce(p_metadata, '{}'::jsonb)
    )
    RETURNING * INTO v_refund;
    v_created := true;

    IF v_new_refunded >= v_payment.amount_minor THEN
      v_payment_status := 'refunded';
    ELSE
      v_payment_status := 'partially_refunded';
    END IF;

    UPDATE public.payments
    SET
      refunded_minor = v_new_refunded,
      status = v_payment_status,
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = v_payment.invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found';
  END IF;

  IF v_invoice.status = 'void' THEN
    v_anomaly := 'refund_on_void_invoice';
  END IF;

  SELECT coalesce(sum(greatest(p.amount_minor - p.refunded_minor, 0)), 0)
  INTO v_net_paid
  FROM public.payments p
  WHERE p.invoice_id = v_invoice.id
    AND p.status IN ('succeeded', 'partially_refunded', 'refunded');

  IF v_net_paid > v_invoice.total_minor THEN
    v_overpayment := v_net_paid - v_invoice.total_minor;
    v_anomaly := coalesce(v_anomaly, 'overpayment');
  END IF;

  v_amount_paid := least(v_net_paid, v_invoice.total_minor);
  v_balance := v_invoice.total_minor - v_amount_paid;

  IF v_invoice.status <> 'void' THEN
    IF v_amount_paid <= 0 THEN
      v_new_status := 'refunded';
      UPDATE public.invoices
      SET
        amount_paid_minor = 0,
        balance_due_minor = v_invoice.total_minor,
        status = v_new_status,
        paid_at = NULL,
        updated_at = now()
      WHERE id = v_invoice.id
      RETURNING * INTO v_invoice;
    ELSIF v_balance > 0 THEN
      v_new_status := 'partially_paid';
      UPDATE public.invoices
      SET
        amount_paid_minor = v_amount_paid,
        balance_due_minor = v_balance,
        status = v_new_status,
        paid_at = NULL,
        updated_at = now()
      WHERE id = v_invoice.id
      RETURNING * INTO v_invoice;
    ELSE
      v_new_status := 'paid';
      UPDATE public.invoices
      SET
        amount_paid_minor = v_amount_paid,
        balance_due_minor = 0,
        status = v_new_status,
        paid_at = coalesce(v_invoice.paid_at, now()),
        updated_at = now()
      WHERE id = v_invoice.id
      RETURNING * INTO v_invoice;
    END IF;
  END IF;

  -- Refunds never auto-regress Project workflow — surface for Studio review.
  IF v_created THEN
    v_anomaly := coalesce(v_anomaly, 'refund_no_project_regress');
  END IF;

  RETURN jsonb_build_object(
    'refund_id', v_refund.id,
    'refund_created', v_created,
    'payment_id', v_payment.id,
    'invoice_id', v_invoice.id,
    'invoice_status', v_invoice.status,
    'invoice_type', v_invoice.invoice_type,
    'project_id', v_invoice.project_id,
    'client_id', v_invoice.client_id,
    'amount_paid_minor', v_invoice.amount_paid_minor,
    'balance_due_minor', v_invoice.balance_due_minor,
    'overpayment_minor', v_overpayment,
    'anomaly', v_anomaly
  );
END;
$$;

COMMENT ON FUNCTION public.apply_succeeded_stripe_refund IS
  'Idempotent Stripe refund upsert + Invoice net-paid recompute. Does not regress Project status.';

REVOKE ALL ON FUNCTION public.apply_succeeded_stripe_refund(
  text, text, bigint, public.currency_code, timestamptz, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_succeeded_stripe_refund(
  text, text, bigint, public.currency_code, timestamptz, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_succeeded_stripe_refund(
  text, text, bigint, public.currency_code, timestamptz, text, jsonb
) TO service_role;
