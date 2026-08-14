-- Documents, email logs, reminders, activity logs, webhook events + reporting views

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type public.document_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  version_id uuid,
  document_type public.document_type NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size bigint,
  checksum text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_storage_path_not_blank CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT documents_bucket_not_blank CHECK (length(trim(storage_bucket)) > 0),
  CONSTRAINT documents_file_size_non_negative CHECK (file_size IS NULL OR file_size >= 0)
);

CREATE INDEX documents_resource_idx ON public.documents (resource_type, resource_id);

COMMENT ON TABLE public.documents IS
  'Private generated files. Use signed/authenticated access — never public enumerable URLs.';

CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals (id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  email_type public.email_type NOT NULL,
  recipient_email text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  subject text NOT NULL,
  status public.email_delivery_status NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced_at timestamptz,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_logs_recipient_not_blank CHECK (length(trim(recipient_email)) > 0),
  CONSTRAINT email_logs_subject_not_blank CHECK (length(trim(subject)) > 0)
);

CREATE TRIGGER email_logs_set_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX email_logs_invoice_id_idx ON public.email_logs (invoice_id);
CREATE INDEX email_logs_proposal_id_idx ON public.email_logs (proposal_id);
CREATE INDEX email_logs_client_id_idx ON public.email_logs (client_id);
CREATE INDEX email_logs_status_idx ON public.email_logs (status);

COMMENT ON TABLE public.email_logs IS
  'Transactional email delivery state. Avoid storing full sensitive bodies.';

CREATE TABLE public.reminder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE RESTRICT,
  reminder_type public.reminder_type NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz,
  status public.reminder_status NOT NULL DEFAULT 'scheduled',
  email_log_id uuid REFERENCES public.email_logs (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_events_unique_schedule UNIQUE (invoice_id, reminder_type, scheduled_for)
);

CREATE INDEX reminder_events_invoice_scheduled_idx
  ON public.reminder_events (invoice_id, scheduled_for);

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_type public.activity_actor_type NOT NULL DEFAULT 'system',
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals (id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments (id) ON DELETE SET NULL,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_logs_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT activity_logs_subject_type_not_blank CHECK (length(trim(subject_type)) > 0)
);

CREATE INDEX activity_logs_client_created_idx ON public.activity_logs (client_id, created_at DESC);
CREATE INDEX activity_logs_project_created_idx ON public.activity_logs (project_id, created_at DESC);
CREATE INDEX activity_logs_action_idx ON public.activity_logs (action);

COMMENT ON TABLE public.activity_logs IS
  'Append-only audit trail. Do not put secrets in metadata. Prefer soft retention over deletion.';

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'stripe',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  processing_status public.webhook_processing_status NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  failure_message text,
  payload_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, provider_event_id),
  CONSTRAINT webhook_events_event_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT webhook_events_provider_event_id_not_blank CHECK (length(trim(provider_event_id)) > 0)
);

CREATE INDEX webhook_events_status_idx ON public.webhook_events (processing_status);

COMMENT ON TABLE public.webhook_events IS
  'Idempotency ledger for provider webhooks (Phase 11). Prefer sanitized metadata over full payloads.';

-- Derived reporting views (read-only convenience; not source of truth)
CREATE OR REPLACE VIEW public.client_financial_summary
WITH (security_invoker = true)
AS
SELECT
  c.id AS client_id,
  c.company_name,
  coalesce(sum(p.amount_minor) FILTER (WHERE p.status = 'succeeded'), 0)::bigint AS lifetime_paid_minor,
  coalesce(sum(i.balance_due_minor) FILTER (
    WHERE i.status IN ('issued', 'sent', 'partially_paid', 'overdue')
  ), 0)::bigint AS outstanding_balance_minor
FROM public.clients c
LEFT JOIN public.invoices i ON i.client_id = c.id
LEFT JOIN public.payments p ON p.client_id = c.id
GROUP BY c.id, c.company_name;

CREATE OR REPLACE VIEW public.invoice_status_summary
WITH (security_invoker = true)
AS
SELECT
  status,
  count(*)::bigint AS invoice_count,
  coalesce(sum(balance_due_minor), 0)::bigint AS balance_due_minor_sum
FROM public.invoices
GROUP BY status;
