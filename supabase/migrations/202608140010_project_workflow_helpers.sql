-- Phase 7: Project workflow helpers
-- - status_before_archive for documented restore audit trail
-- - atomic transition_project RPC (expected-status concurrency)
-- - useful list indexes
-- SECURITY INVOKER so RLS still applies.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status_before_archive public.project_status;

COMMENT ON COLUMN public.projects.status_before_archive IS
  'Status captured when archiving. Restore in Phase 7 returns to inquiry (neutral); this column is audit metadata.';

CREATE INDEX IF NOT EXISTS projects_updated_at_idx ON public.projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_name_idx ON public.projects (lower(name));
CREATE INDEX IF NOT EXISTS projects_target_completion_date_idx
  ON public.projects (target_completion_date);

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

  -- Allowed transition map (must match src/lib/projects/workflow.ts)
  IF p_expected_status = 'inquiry' AND p_target_status IN ('proposal', 'archived') THEN
    v_allowed := true;
  ELSIF p_expected_status = 'proposal' AND p_target_status IN ('awaiting_approval', 'inquiry', 'archived') THEN
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

COMMENT ON FUNCTION public.transition_project(uuid, public.project_status, public.project_status) IS
  'Atomic project status transition with expected-status concurrency check. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.transition_project(uuid, public.project_status, public.project_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_project(uuid, public.project_status, public.project_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_project(uuid, public.project_status, public.project_status) TO service_role;
