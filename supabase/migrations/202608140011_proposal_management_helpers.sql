-- Phase 8: Proposal management helpers
-- - Snapshot identity / tax / deposit on versions
-- - finalized_at (immutable without faking sent)
-- - create / save draft / revision / default-template RPCs
-- SECURITY INVOKER so RLS still applies.

ALTER TABLE public.proposal_versions
  ADD COLUMN IF NOT EXISTS client_display_name text,
  ADD COLUMN IF NOT EXISTS client_contact_name text,
  ADD COLUMN IF NOT EXISTS client_contact_email text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS tax_bps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_bps integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

ALTER TABLE public.proposal_versions
  DROP CONSTRAINT IF EXISTS proposal_versions_tax_bps_non_negative;
ALTER TABLE public.proposal_versions
  ADD CONSTRAINT proposal_versions_tax_bps_non_negative CHECK (tax_bps >= 0);

ALTER TABLE public.proposal_versions
  DROP CONSTRAINT IF EXISTS proposal_versions_deposit_bps_range;
ALTER TABLE public.proposal_versions
  ADD CONSTRAINT proposal_versions_deposit_bps_range
  CHECK (deposit_bps >= 0 AND deposit_bps <= 10000);

COMMENT ON COLUMN public.proposal_versions.finalized_at IS
  'Set when a version is locked for client-ready review in Phase 8. Does not imply delivery (sent_at).';
COMMENT ON COLUMN public.proposal_versions.client_display_name IS
  'Historical client display snapshot for this version.';

CREATE INDEX IF NOT EXISTS proposals_updated_at_idx ON public.proposals (updated_at DESC);
CREATE INDEX IF NOT EXISTS proposals_proposal_number_idx ON public.proposals (lower(proposal_number));
CREATE INDEX IF NOT EXISTS proposal_templates_archived_idx
  ON public.proposal_templates (is_archived, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_default_proposal_template(p_template_id uuid)
RETURNS public.proposal_templates
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.proposal_templates;
BEGIN
  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.proposal_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.is_archived THEN
    RAISE EXCEPTION 'archived template cannot be default' USING ERRCODE = '22023';
  END IF;

  UPDATE public.proposal_templates
  SET is_default = false
  WHERE is_default = true AND is_archived = false AND id IS DISTINCT FROM p_template_id;

  UPDATE public.proposal_templates
  SET is_default = true, updated_at = now()
  WHERE id = p_template_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_proposal_template(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_proposal_template(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_proposal_template(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_proposal_revision(p_proposal_id uuid)
RETURNS public.proposal_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_proposal public.proposals;
  v_source public.proposal_versions;
  v_next integer;
  v_new public.proposal_versions;
  v_item public.proposal_items;
BEGIN
  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_proposal.status IN ('archived', 'accepted') THEN
    RAISE EXCEPTION 'cannot revise proposal in status %', v_proposal.status USING ERRCODE = '22023';
  END IF;
  IF v_proposal.current_version_id IS NULL THEN
    RAISE EXCEPTION 'proposal has no current version' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.proposal_versions
  WHERE id = v_proposal.current_version_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source version not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_source.is_immutable THEN
    RAISE EXCEPTION 'current version is still editable; finalize before revising'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next
  FROM public.proposal_versions
  WHERE proposal_id = p_proposal_id;

  INSERT INTO public.proposal_versions (
    proposal_id, version_number, title, introduction, project_overview, objectives,
    scope, deliverables, timeline, payment_schedule, terms_and_conditions, notes,
    sections, subtotal_minor, discount_minor, tax_minor, total_minor, currency,
    expires_at, is_immutable, created_by,
    client_display_name, client_contact_name, client_contact_email, project_name,
    tax_bps, deposit_bps, finalized_at
  )
  VALUES (
    p_proposal_id, v_next, v_source.title, v_source.introduction, v_source.project_overview,
    v_source.objectives, v_source.scope, v_source.deliverables, v_source.timeline,
    v_source.payment_schedule, v_source.terms_and_conditions, v_source.notes,
    v_source.sections, v_source.subtotal_minor, v_source.discount_minor, v_source.tax_minor,
    v_source.total_minor, v_source.currency, v_source.expires_at, false, v_source.created_by,
    v_source.client_display_name, v_source.client_contact_name, v_source.client_contact_email,
    v_source.project_name, v_source.tax_bps, v_source.deposit_bps, NULL
  )
  RETURNING * INTO v_new;

  INSERT INTO public.proposal_items (
    proposal_version_id, item_type, description, quantity, rate_minor, amount_minor,
    sort_order, optional, selected
  )
  SELECT
    v_new.id, item_type, description, quantity, rate_minor, amount_minor,
    sort_order, optional, selected
  FROM public.proposal_items
  WHERE proposal_version_id = v_source.id
  ORDER BY sort_order ASC, created_at ASC;

  UPDATE public.proposals
  SET current_version_id = v_new.id,
      status = CASE WHEN status = 'draft' THEN 'draft' ELSE status END,
      updated_at = now()
  WHERE id = p_proposal_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.create_proposal_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proposal_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proposal_revision(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_proposal_version(
  p_proposal_id uuid,
  p_version_id uuid
)
RETURNS public.proposal_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_proposal public.proposals;
  v_version public.proposal_versions;
BEGIN
  IF NOT public.is_studio_user() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_proposal.status = 'archived' THEN
    RAISE EXCEPTION 'archived proposal cannot be finalized' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_version
  FROM public.proposal_versions
  WHERE id = p_version_id AND proposal_id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'version not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_version.is_immutable THEN
    RAISE EXCEPTION 'version already immutable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.proposal_versions
  SET is_immutable = true,
      finalized_at = COALESCE(finalized_at, now())
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  -- Parent stays draft — delivery (sent) is Phase 12.
  UPDATE public.proposals
  SET current_version_id = p_version_id,
      updated_at = now()
  WHERE id = p_proposal_id;

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_proposal_version(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_proposal_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_proposal_version(uuid, uuid) TO service_role;
