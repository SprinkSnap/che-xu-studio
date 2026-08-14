-- Invoices, invoice items, payments, refunds

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects (id) ON DELETE RESTRICT,
  proposal_id uuid REFERENCES public.proposals (id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_type public.invoice_type NOT NULL DEFAULT 'manual',
  status public.invoice_status NOT NULL DEFAULT 'draft',
  currency public.currency_code NOT NULL DEFAULT 'CAD',
  issue_date date,
  due_date date,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  amount_paid_minor bigint NOT NULL DEFAULT 0,
  balance_due_minor bigint NOT NULL DEFAULT 0,
  payment_instructions text,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_unique UNIQUE (invoice_number),
  CONSTRAINT invoices_number_not_blank CHECK (length(trim(invoice_number)) > 0),
  CONSTRAINT invoices_money_non_negative CHECK (
    subtotal_minor >= 0
    AND discount_minor >= 0
    AND tax_minor >= 0
    AND total_minor >= 0
    AND amount_paid_minor >= 0
    AND balance_due_minor >= 0
  ),
  CONSTRAINT invoices_balance_matches_paid CHECK (balance_due_minor = total_minor - amount_paid_minor),
  CONSTRAINT invoices_paid_not_over_total CHECK (amount_paid_minor <= total_minor)
);

CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX invoices_client_id_idx ON public.invoices (client_id);
CREATE INDEX invoices_project_id_idx ON public.invoices (project_id);
CREATE INDEX invoices_status_idx ON public.invoices (status);
CREATE INDEX invoices_due_date_idx ON public.invoices (due_date);

COMMENT ON TABLE public.invoices IS
  'Issued invoices are financial snapshots. Totals/line items lock after leaving draft.';

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12, 4) NOT NULL DEFAULT 1,
  rate_minor bigint NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_description_not_blank CHECK (length(trim(description)) > 0),
  CONSTRAINT invoice_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT invoice_items_rate_non_negative CHECK (rate_minor >= 0),
  CONSTRAINT invoice_items_amount_non_negative CHECK (amount_minor >= 0)
);

CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items (invoice_id);

-- Draft invoices may cascade-delete items with the invoice.
-- Once issued, application/triggers prevent deleting issued invoices; RESTRICT on client/project protects history.

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'CAD',
  payment_method text,
  provider text NOT NULL DEFAULT 'stripe',
  provider_payment_id text,
  provider_checkout_session_id text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_minor bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT payments_refunded_non_negative CHECK (refunded_minor >= 0),
  CONSTRAINT payments_refunded_not_over_amount CHECK (refunded_minor <= amount_minor)
);

CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX payments_provider_payment_id_unique_idx
  ON public.payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX payments_invoice_id_idx ON public.payments (invoice_id);
CREATE INDEX payments_client_id_idx ON public.payments (client_id);
CREATE INDEX payments_status_idx ON public.payments (status);

COMMENT ON TABLE public.payments IS
  'Stripe payment records. Never store PAN/CVV; only provider identifiers and safe descriptors.';

CREATE TABLE public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL,
  currency public.currency_code NOT NULL DEFAULT 'CAD',
  provider_refund_id text,
  status public.refund_status NOT NULL DEFAULT 'pending',
  reason text,
  refunded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_amount_positive CHECK (amount_minor > 0)
);

CREATE UNIQUE INDEX refunds_provider_refund_id_unique_idx
  ON public.refunds (provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE INDEX refunds_payment_id_idx ON public.refunds (payment_id);

COMMENT ON TABLE public.refunds IS
  'Refunds never delete the original payment row.';
