-- Clients, contacts, projects, settings, number counters + allocation function

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  display_name text,
  billing_email text,
  phone text,
  billing_address_line1 text,
  billing_address_line2 text,
  billing_city text,
  billing_region text,
  billing_postal_code text,
  billing_country text,
  company_address_line1 text,
  company_address_line2 text,
  company_city text,
  company_region text,
  company_postal_code text,
  company_country text,
  notes text,
  status public.client_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clients_company_name_not_blank CHECK (length(trim(company_name)) > 0)
);

CREATE TRIGGER clients_set_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX clients_status_idx ON public.clients (status);
CREATE INDEX clients_company_name_idx ON public.clients (company_name);

COMMENT ON TABLE public.clients IS
  'Studio clients. Soft-archive via status/archived_at; do not hard-delete financial parents.';

CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text,
  phone text,
  job_title text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_contacts_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER client_contacts_set_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX client_contacts_client_id_idx ON public.client_contacts (client_id);

-- At most one primary contact per client
CREATE UNIQUE INDEX client_contacts_one_primary_per_client_idx
  ON public.client_contacts (client_id)
  WHERE is_primary = true;

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  name text NOT NULL,
  project_type text,
  description text,
  scope text,
  deliverables text,
  start_date date,
  target_completion_date date,
  project_price_minor bigint NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'CAD',
  tax_bps integer NOT NULL DEFAULT 0,
  deposit_bps integer NOT NULL DEFAULT 5000,
  status public.project_status NOT NULL DEFAULT 'inquiry',
  internal_notes text,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT projects_price_non_negative CHECK (project_price_minor >= 0),
  CONSTRAINT projects_tax_bps_non_negative CHECK (tax_bps >= 0),
  CONSTRAINT projects_deposit_bps_range CHECK (deposit_bps >= 0 AND deposit_bps <= 10000)
);

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX projects_client_id_idx ON public.projects (client_id);
CREATE INDEX projects_status_idx ON public.projects (status);

COMMENT ON COLUMN public.projects.deposit_bps IS
  'Deposit percentage in basis points. 5000 = 50.00%.';
COMMENT ON COLUMN public.projects.tax_bps IS
  'Tax rate in basis points. 1300 = 13.00%.';
COMMENT ON COLUMN public.projects.project_price_minor IS
  'Project price in integer minor currency units (e.g. CAD cents).';

-- Singleton-style studio settings (one row expected; not enforced as singleton for flexibility)
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_name text NOT NULL DEFAULT 'Che Xu Studio',
  legal_name text,
  contact_email text,
  billing_email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country text,
  default_currency public.currency_code NOT NULL DEFAULT 'CAD',
  default_tax_bps integer NOT NULL DEFAULT 0,
  default_deposit_bps integer NOT NULL DEFAULT 5000,
  invoice_prefix text NOT NULL DEFAULT 'CXS',
  proposal_prefix text NOT NULL DEFAULT 'CXS-P',
  payment_terms_days integer NOT NULL DEFAULT 14,
  reminders_enabled boolean NOT NULL DEFAULT true,
  attach_pdf_by_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_default_tax_bps_non_negative CHECK (default_tax_bps >= 0),
  CONSTRAINT settings_default_deposit_bps_range CHECK (
    default_deposit_bps >= 0 AND default_deposit_bps <= 10000
  ),
  CONSTRAINT settings_payment_terms_days_non_negative CHECK (payment_terms_days >= 0),
  CONSTRAINT settings_invoice_prefix_not_blank CHECK (length(trim(invoice_prefix)) > 0),
  CONSTRAINT settings_proposal_prefix_not_blank CHECK (length(trim(proposal_prefix)) > 0)
);

CREATE TRIGGER settings_set_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.settings (studio_name)
VALUES ('Che Xu Studio');

CREATE TABLE public.number_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_type public.number_counter_type NOT NULL,
  year integer NOT NULL,
  prefix text NOT NULL,
  current_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT number_counters_year_valid CHECK (year >= 2000 AND year <= 2100),
  CONSTRAINT number_counters_current_value_non_negative CHECK (current_value >= 0),
  CONSTRAINT number_counters_unique UNIQUE (counter_type, year, prefix)
);

CREATE TRIGGER number_counters_set_updated_at
  BEFORE UPDATE ON public.number_counters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

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
BEGIN
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
  'SECURITY DEFINER atomic document number allocator. Fixed search_path; increments number_counters under row lock.';

REVOKE ALL ON FUNCTION public.next_document_number(public.number_counter_type, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_document_number(public.number_counter_type, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(public.number_counter_type, text, integer) TO service_role;
