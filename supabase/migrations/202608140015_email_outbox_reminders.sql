-- Phase 12 — Email outbox, idempotency, reminder settings, multi Invoice links

-- ---------------------------------------------------------------------------
-- email_logs: idempotency key for successful/queued sends
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.email_logs.idempotency_key IS
  'Application idempotency key. Unique when set so retries cannot duplicate sends.';

CREATE UNIQUE INDEX IF NOT EXISTS email_logs_idempotency_key_unique_idx
  ON public.email_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- email_outbox: pending side-effect work (acceptance/payment/reminders/send)
-- Capability tokens are NEVER stored here — generate at send time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_type public.email_type NOT NULL,
  recipient_email text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals (id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments (id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  email_log_id uuid REFERENCES public.email_logs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_outbox_recipient_not_blank CHECK (length(trim(recipient_email)) > 0),
  CONSTRAINT email_outbox_resource_type_not_blank CHECK (length(trim(resource_type)) > 0),
  CONSTRAINT email_outbox_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT email_outbox_status_check CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'canceled', 'skipped')
  ),
  CONSTRAINT email_outbox_attempt_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT email_outbox_max_attempts_positive CHECK (max_attempts > 0)
);

CREATE TRIGGER email_outbox_set_updated_at
  BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS email_outbox_pending_idx
  ON public.email_outbox (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS email_outbox_resource_idx
  ON public.email_outbox (resource_type, resource_id);

COMMENT ON TABLE public.email_outbox IS
  'Queued transactional email intents. Do not store raw capability tokens in payload.';

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox FORCE ROW LEVEL SECURITY;

CREATE POLICY email_outbox_studio_select
  ON public.email_outbox FOR SELECT TO authenticated
  USING (public.is_studio_user());

CREATE POLICY email_outbox_studio_write
  ON public.email_outbox FOR ALL TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

GRANT SELECT ON public.email_outbox TO authenticated;
GRANT ALL ON public.email_outbox TO service_role;

-- ---------------------------------------------------------------------------
-- Invoice-level reminder override
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_reminders_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.invoices.payment_reminders_enabled IS
  'When false, scheduled payment reminders are skipped for this Invoice.';

-- ---------------------------------------------------------------------------
-- Settings: timezone + reminder schedule (JSON array of overdue day offsets)
-- ---------------------------------------------------------------------------
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS business_timezone text NOT NULL DEFAULT 'America/Toronto',
  ADD COLUMN IF NOT EXISTS reminder_before_due_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reminder_due_day_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_overdue_days integer[] NOT NULL DEFAULT ARRAY[3, 7];

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_reminder_before_due_days_non_negative;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_reminder_before_due_days_non_negative
  CHECK (reminder_before_due_days >= 0);

ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_business_timezone_not_blank;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_business_timezone_not_blank
  CHECK (length(trim(business_timezone)) > 0);

COMMENT ON COLUMN public.settings.business_timezone IS
  'IANA timezone for Invoice due-date reminder day boundaries (e.g. America/Toronto).';
COMMENT ON COLUMN public.settings.reminder_overdue_days IS
  'Overdue reminder offsets in whole days after due date (e.g. {3,7}).';

-- ---------------------------------------------------------------------------
-- Allow multiple active Invoice capability links (Phase 12 email/reminders)
-- Each outbound email may mint a fresh token without invalidating prior emails.
-- Cap enforced in application code. Admin Replace still revokes all active.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.public_links_active_invoice_unique_idx;

CREATE INDEX IF NOT EXISTS public_links_invoice_active_idx
  ON public.public_links (resource_id)
  WHERE resource_type = 'invoice' AND revoked_at IS NULL;

-- Allow multiple active Proposal links per exact Version (same capability).
DROP INDEX IF EXISTS public.public_links_active_proposal_version_unique_idx;

CREATE INDEX IF NOT EXISTS public_links_proposal_version_active_idx
  ON public.public_links (proposal_version_id)
  WHERE resource_type = 'proposal'
    AND proposal_version_id IS NOT NULL
    AND revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Reminder status: add skipped for payment-race cancellations
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'reminder_status' AND e.enumlabel = 'skipped'
  ) THEN
    ALTER TYPE public.reminder_status ADD VALUE 'skipped';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'email_type' AND e.enumlabel = 'proposal_changes_requested'
  ) THEN
    ALTER TYPE public.email_type ADD VALUE 'proposal_changes_requested';
  END IF;
END $$;
