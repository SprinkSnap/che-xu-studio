-- Studio OS Phase 4 — extensions, enums, shared triggers, profiles
-- Cloudflare D1 leads remain in /migrations (Wrangler). Do not mix tools.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roles expected by Supabase Data API. Created only when missing (local PG tests).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Enums (closed sets; add values via ALTER TYPE in future migrations)
-- ---------------------------------------------------------------------------

CREATE TYPE public.studio_role AS ENUM ('owner', 'admin', 'staff');
CREATE TYPE public.studio_user_status AS ENUM ('active', 'suspended');

CREATE TYPE public.client_status AS ENUM ('active', 'archived');

CREATE TYPE public.project_status AS ENUM (
  'inquiry',
  'proposal',
  'awaiting_approval',
  'deposit_due',
  'active',
  'awaiting_final_payment',
  'completed',
  'archived'
);

CREATE TYPE public.proposal_status AS ENUM (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'changes_requested',
  'expired',
  'declined',
  'archived'
);

CREATE TYPE public.proposal_item_type AS ENUM ('service', 'add_on', 'discount');

CREATE TYPE public.invoice_type AS ENUM ('deposit', 'final', 'manual', 'adjustment');

CREATE TYPE public.invoice_status AS ENUM (
  'draft',
  'issued',
  'sent',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  'refunded'
);

CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'succeeded',
  'failed',
  'partially_refunded',
  'refunded',
  'canceled'
);

CREATE TYPE public.refund_status AS ENUM ('pending', 'succeeded', 'failed', 'canceled');

CREATE TYPE public.public_link_resource_type AS ENUM ('proposal', 'invoice', 'receipt');

CREATE TYPE public.document_resource_type AS ENUM ('proposal', 'invoice', 'receipt');

CREATE TYPE public.document_type AS ENUM ('proposal_pdf', 'invoice_pdf', 'receipt_pdf');

CREATE TYPE public.email_type AS ENUM (
  'proposal_sent',
  'proposal_accepted',
  'deposit_invoice',
  'final_invoice',
  'payment_received',
  'payment_reminder'
);

CREATE TYPE public.email_delivery_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'complained'
);

CREATE TYPE public.reminder_type AS ENUM (
  'before_due',
  'due_today',
  'overdue_3_days',
  'overdue_7_days',
  'custom'
);

CREATE TYPE public.reminder_status AS ENUM ('scheduled', 'sent', 'canceled', 'failed');

CREATE TYPE public.activity_actor_type AS ENUM ('user', 'client', 'system', 'stripe');

CREATE TYPE public.webhook_processing_status AS ENUM (
  'received',
  'processing',
  'processed',
  'failed',
  'ignored'
);

CREATE TYPE public.number_counter_type AS ENUM ('invoice', 'proposal');

CREATE TYPE public.currency_code AS ENUM ('CAD', 'USD');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- profiles (Studio membership — identity from auth.users)
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  email text NOT NULL,
  role public.studio_role NOT NULL DEFAULT 'staff',
  status public.studio_user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_email_not_blank CHECK (length(trim(email)) > 0)
);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX profiles_status_idx ON public.profiles (status);
CREATE INDEX profiles_role_idx ON public.profiles (role);

COMMENT ON TABLE public.profiles IS
  'Studio membership metadata. Auth secrets live in auth.users only.';
