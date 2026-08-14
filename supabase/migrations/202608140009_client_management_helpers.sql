-- Phase 6: Client management helpers
-- - Net refunds in client_financial_summary (lifetime revenue)
-- - Atomic create client + primary contact
-- - Atomic set primary contact
-- - Directory-friendly search indexes
-- SECURITY INVOKER so RLS still applies to the calling role.

-- Lifetime revenue = succeeded/partially_refunded/refunded payments net of refunded_minor.
-- Outstanding = balance_due on issued unpaid invoice statuses (excludes draft/void/paid).
-- Use scalar subqueries (not dual LEFT JOINs) to avoid invoice×payment cartesian double-counting.
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
      AND i.status IN ('issued', 'sent', 'partially_paid', 'overdue')
  ), 0)::bigint AS outstanding_balance_minor
FROM public.clients c;

COMMENT ON VIEW public.client_financial_summary IS
  'Per-client aggregates. lifetime_paid_minor = net succeeded payments (amount - refunded). outstanding_balance_minor excludes draft/void/paid.';

CREATE INDEX IF NOT EXISTS clients_billing_email_idx
  ON public.clients (lower(billing_email))
  WHERE billing_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_display_name_idx
  ON public.clients (lower(display_name))
  WHERE display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_updated_at_idx
  ON public.clients (updated_at DESC);

CREATE INDEX IF NOT EXISTS client_contacts_email_idx
  ON public.client_contacts (lower(email))
  WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- create_client_with_primary_contact
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_client_with_primary_contact(
  p_company_name text,
  p_contact_name text,
  p_display_name text DEFAULT NULL,
  p_billing_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_billing_address_line1 text DEFAULT NULL,
  p_billing_address_line2 text DEFAULT NULL,
  p_billing_city text DEFAULT NULL,
  p_billing_region text DEFAULT NULL,
  p_billing_postal_code text DEFAULT NULL,
  p_billing_country text DEFAULT NULL,
  p_company_address_line1 text DEFAULT NULL,
  p_company_address_line2 text DEFAULT NULL,
  p_company_city text DEFAULT NULL,
  p_company_region text DEFAULT NULL,
  p_company_postal_code text DEFAULT NULL,
  p_company_country text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 THEN
    RAISE EXCEPTION 'company_name required' USING ERRCODE = '23514';
  END IF;

  IF p_contact_name IS NULL OR length(trim(p_contact_name)) = 0 THEN
    RAISE EXCEPTION 'contact_name required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.clients (
    company_name,
    display_name,
    billing_email,
    phone,
    billing_address_line1,
    billing_address_line2,
    billing_city,
    billing_region,
    billing_postal_code,
    billing_country,
    company_address_line1,
    company_address_line2,
    company_city,
    company_region,
    company_postal_code,
    company_country,
    notes
  ) VALUES (
    trim(p_company_name),
    nullif(trim(p_display_name), ''),
    nullif(lower(trim(p_billing_email)), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_billing_address_line1), ''),
    nullif(trim(p_billing_address_line2), ''),
    nullif(trim(p_billing_city), ''),
    nullif(trim(p_billing_region), ''),
    nullif(trim(p_billing_postal_code), ''),
    nullif(trim(p_billing_country), ''),
    nullif(trim(p_company_address_line1), ''),
    nullif(trim(p_company_address_line2), ''),
    nullif(trim(p_company_city), ''),
    nullif(trim(p_company_region), ''),
    nullif(trim(p_company_postal_code), ''),
    nullif(trim(p_company_country), ''),
    nullif(trim(p_notes), '')
  )
  RETURNING id INTO v_client_id;

  INSERT INTO public.client_contacts (
    client_id,
    name,
    email,
    phone,
    job_title,
    is_primary
  ) VALUES (
    v_client_id,
    trim(p_contact_name),
    nullif(lower(trim(p_contact_email)), ''),
    nullif(trim(p_contact_phone), ''),
    nullif(trim(p_contact_job_title), ''),
    true
  );

  RETURN v_client_id;
END;
$$;

COMMENT ON FUNCTION public.create_client_with_primary_contact IS
  'Atomic client + primary contact insert. SECURITY INVOKER; requires is_studio_user().';

REVOKE ALL ON FUNCTION public.create_client_with_primary_contact(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_with_primary_contact(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_with_primary_contact(
  text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- set_primary_client_contact
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_primary_client_contact(
  p_client_id uuid,
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_found boolean;
BEGIN
  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.client_contacts
    WHERE id = p_contact_id
      AND client_id = p_client_id
  ) INTO v_found;

  IF NOT v_found THEN
    RAISE EXCEPTION 'contact not found for client' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.client_contacts
  SET is_primary = false
  WHERE client_id = p_client_id
    AND is_primary = true
    AND id IS DISTINCT FROM p_contact_id;

  UPDATE public.client_contacts
  SET is_primary = true
  WHERE id = p_contact_id
    AND client_id = p_client_id;
END;
$$;

COMMENT ON FUNCTION public.set_primary_client_contact(uuid, uuid) IS
  'Atomically switches the primary contact for a client. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.set_primary_client_contact(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_primary_client_contact(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_client_contact(uuid, uuid) TO service_role;
