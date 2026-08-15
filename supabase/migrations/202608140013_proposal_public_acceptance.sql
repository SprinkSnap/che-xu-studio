-- Phase 10 — Secure client proposal acceptance
-- Exact-version public links, change requests, acceptance support.

-- Bind capability links to an exact immutable proposal version.
ALTER TABLE public.public_links
  ADD COLUMN IF NOT EXISTS proposal_version_id uuid REFERENCES public.proposal_versions (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz;

COMMENT ON COLUMN public.public_links.proposal_version_id IS
  'Exact proposal version for proposal links. Required for resource_type = proposal. Never silently repoint.';
COMMENT ON COLUMN public.public_links.first_viewed_at IS
  'First successful public view. Subsequent views update last_accessed_at only.';

CREATE INDEX IF NOT EXISTS public_links_proposal_version_id_idx
  ON public.public_links (proposal_version_id)
  WHERE proposal_version_id IS NOT NULL;

-- One active (non-revoked) capability link per proposal version.
CREATE UNIQUE INDEX IF NOT EXISTS public_links_active_proposal_version_unique_idx
  ON public.public_links (proposal_version_id)
  WHERE resource_type = 'proposal'
    AND proposal_version_id IS NOT NULL
    AND revoked_at IS NULL;

-- Change requests (never mutate the immutable version).
CREATE TABLE IF NOT EXISTS public.proposal_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals (id) ON DELETE RESTRICT,
  proposal_version_id uuid NOT NULL REFERENCES public.proposal_versions (id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  requested_by_name text NOT NULL,
  requested_by_email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT proposal_change_requests_name_not_blank CHECK (length(trim(requested_by_name)) > 0),
  CONSTRAINT proposal_change_requests_email_not_blank CHECK (length(trim(requested_by_email)) > 0),
  CONSTRAINT proposal_change_requests_message_not_blank CHECK (length(trim(message)) > 0)
);

CREATE INDEX IF NOT EXISTS proposal_change_requests_proposal_id_idx
  ON public.proposal_change_requests (proposal_id);
CREATE INDEX IF NOT EXISTS proposal_change_requests_version_id_idx
  ON public.proposal_change_requests (proposal_version_id);

COMMENT ON TABLE public.proposal_change_requests IS
  'Client-requested changes against an exact proposal version. Version content is never mutated.';

ALTER TABLE public.proposal_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_change_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY proposal_change_requests_studio_select
  ON public.proposal_change_requests FOR SELECT TO authenticated
  USING (public.is_studio_user());

CREATE POLICY proposal_change_requests_studio_insert
  ON public.proposal_change_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());

CREATE POLICY proposal_change_requests_studio_update
  ON public.proposal_change_requests FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

-- Allow controlled proposal → deposit_due for Phase 10 acceptance (and keep awaiting_approval path).
CREATE OR REPLACE FUNCTION public.transition_project(
  p_project_id uuid,
  p_expected_status public.project_status,
  p_target_status public.project_status
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.projects;
  v_allowed boolean := false;
BEGIN
  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_expected_status = 'inquiry' AND p_target_status IN ('proposal', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'proposal' AND p_target_status IN ('awaiting_approval', 'deposit_due', 'inquiry', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'awaiting_approval' AND p_target_status IN ('deposit_due', 'proposal', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'deposit_due' AND p_target_status IN ('active', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'active' AND p_target_status IN ('awaiting_final_payment', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'awaiting_final_payment' AND p_target_status IN ('completed', 'active', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'completed' AND p_target_status IN ('archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'archived' AND p_target_status IN ('inquiry') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'invalid project transition from % to %', p_expected_status, p_target_status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'project status conflict' USING ERRCODE = '40001';
  END IF;

  UPDATE public.projects
  SET
    status = p_target_status,
    completed_at = CASE
      WHEN p_target_status = 'completed' THEN now()
      WHEN p_expected_status = 'completed' THEN NULL
      ELSE completed_at
    END,
    archived_at = CASE
      WHEN p_target_status = 'archived' THEN now()
      WHEN p_expected_status = 'archived' THEN NULL
      ELSE archived_at
    END,
    status_before_archive = CASE
      WHEN p_target_status = 'archived' THEN p_expected_status
      WHEN p_expected_status = 'archived' THEN NULL
      ELSE status_before_archive
    END,
    updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
