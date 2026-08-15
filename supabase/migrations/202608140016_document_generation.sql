-- Phase 13 — Document generation status, canonical uniqueness, private Storage, jobs

-- ---------------------------------------------------------------------------
-- documents: generation lifecycle + canonical versioning
-- ---------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS generation_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS renderer_version text NOT NULL DEFAULT 'document-v1',
  ADD COLUMN IF NOT EXISTS is_canonical boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending', 'ready', 'failed', 'superseded'));

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_generation_version_positive;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_generation_version_positive
  CHECK (generation_version > 0);

COMMENT ON COLUMN public.documents.status IS
  'pending = reserved/generating; ready = downloadable; failed = generation error; superseded = replaced by newer generation.';
COMMENT ON COLUMN public.documents.is_canonical IS
  'True for the current canonical PDF of a resource/version. Prior generations keep history with is_canonical=false.';
COMMENT ON COLUMN public.documents.renderer_version IS
  'Template/renderer identity (e.g. proposal-v1). Explicit regeneration may bump generation_version.';

DROP TRIGGER IF EXISTS documents_set_updated_at ON public.documents;
CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- One pending or ready canonical document per resource+type+version binding.
CREATE UNIQUE INDEX IF NOT EXISTS documents_canonical_unique_idx
  ON public.documents (
    resource_type,
    resource_id,
    document_type,
    COALESCE(version_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE is_canonical = true AND status IN ('pending', 'ready');

CREATE INDEX IF NOT EXISTS documents_status_idx
  ON public.documents (status)
  WHERE status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
-- document_jobs: bounded retry for PDF side effects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type public.document_type NOT NULL,
  resource_type public.document_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  version_id uuid,
  payment_id uuid REFERENCES public.payments (id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  document_id uuid REFERENCES public.documents (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_jobs_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT document_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'ready', 'failed', 'canceled', 'skipped')
  ),
  CONSTRAINT document_jobs_attempt_non_negative CHECK (attempt_count >= 0),
  CONSTRAINT document_jobs_max_attempts_positive CHECK (max_attempts > 0)
);

CREATE TRIGGER document_jobs_set_updated_at
  BEFORE UPDATE ON public.document_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS document_jobs_pending_idx
  ON public.document_jobs (next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS document_jobs_resource_idx
  ON public.document_jobs (resource_type, resource_id);

COMMENT ON TABLE public.document_jobs IS
  'Queued PDF generation intents. Financial/acceptance truth must not depend on job success.';

ALTER TABLE public.document_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY document_jobs_studio_select
  ON public.document_jobs FOR SELECT TO authenticated
  USING (public.is_studio_user());

CREATE POLICY document_jobs_studio_write
  ON public.document_jobs FOR ALL TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

GRANT SELECT ON public.document_jobs TO authenticated;
GRANT ALL ON public.document_jobs TO service_role;

-- Tighten documents write to studio admin (generation remains service-role / admin path)
DROP POLICY IF EXISTS documents_studio_write ON public.documents;
CREATE POLICY documents_studio_write
  ON public.documents FOR ALL TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

-- ---------------------------------------------------------------------------
-- Private Storage bucket: studio-documents
-- Guarded for local Postgres harnesses that may not include the Storage schema.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'studio-documents',
      'studio-documents',
      false,
      20971520,
      ARRAY['application/pdf']::text[]
    )
    ON CONFLICT (id) DO UPDATE
    SET
      public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;

  -- No anonymous or authenticated direct object access for this bucket.
  -- Downloads/uploads are mediated by the Worker using the service role after
  -- Studio auth or capability-token validation. Absence of allow policies = deny.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_no_anon ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_studio_select ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_studio_insert ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_studio_update ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_studio_delete ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_deny_anon ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS studio_documents_deny_authenticated_direct ON storage.objects';
  END IF;
END $$;
