-- RLS helpers and policies for Studio OS tables
-- Membership = profiles.auth_user_id = auth.uid() AND status = 'active'
-- Anonymous and arbitrary authenticated non-members get no business-table access.

CREATE OR REPLACE FUNCTION public.is_studio_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_studio_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('owner', 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_studio_user() IS
  'SECURITY DEFINER helper: active Studio membership for auth.uid(). Fixed search_path; no dynamic SQL.';
COMMENT ON FUNCTION public.is_studio_admin() IS
  'SECURITY DEFINER helper: active owner/admin membership for auth.uid(). Fixed search_path; no dynamic SQL.';

REVOKE ALL ON FUNCTION public.is_studio_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_studio_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_studio_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_studio_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_studio_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_studio_admin() TO service_role;

-- Enable RLS on all Studio business tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (defense in depth on Supabase)
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.proposals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_acceptances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.public_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.number_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events FORCE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY profiles_select_own_or_admin
  ON public.profiles FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_studio_admin());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY profiles_admin_insert
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_admin() OR auth_user_id = auth.uid());

-- No DELETE policy for profiles (admin soft-suspend via status)

-- Generic active-member policies for business tables
CREATE POLICY clients_studio_select ON public.clients FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY clients_studio_insert ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY clients_studio_update ON public.clients FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY client_contacts_studio_select ON public.client_contacts FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY client_contacts_studio_insert ON public.client_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY client_contacts_studio_update ON public.client_contacts FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());
CREATE POLICY client_contacts_studio_delete ON public.client_contacts FOR DELETE TO authenticated
  USING (public.is_studio_admin());

CREATE POLICY projects_studio_select ON public.projects FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY projects_studio_insert ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY projects_studio_update ON public.projects FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY proposal_templates_studio_select ON public.proposal_templates FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY proposal_templates_studio_write ON public.proposal_templates FOR ALL TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY proposals_studio_select ON public.proposals FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY proposals_studio_insert ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY proposals_studio_update ON public.proposals FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY proposal_versions_studio_select ON public.proposal_versions FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY proposal_versions_studio_insert ON public.proposal_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY proposal_versions_studio_update ON public.proposal_versions FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY proposal_items_studio_select ON public.proposal_items FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY proposal_items_studio_write ON public.proposal_items FOR ALL TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY proposal_acceptances_studio_select ON public.proposal_acceptances FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY proposal_acceptances_studio_insert ON public.proposal_acceptances FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());

CREATE POLICY public_links_studio_select ON public.public_links FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY public_links_studio_write ON public.public_links FOR ALL TO authenticated
  USING (public.is_studio_admin()) WITH CHECK (public.is_studio_admin());

CREATE POLICY invoices_studio_select ON public.invoices FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY invoices_studio_insert ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY invoices_studio_update ON public.invoices FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY invoice_items_studio_select ON public.invoice_items FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY invoice_items_studio_write ON public.invoice_items FOR ALL TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY payments_studio_select ON public.payments FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY payments_studio_insert ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY payments_studio_update ON public.payments FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY refunds_studio_select ON public.refunds FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY refunds_studio_insert ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_admin());
CREATE POLICY refunds_studio_update ON public.refunds FOR UPDATE TO authenticated
  USING (public.is_studio_admin()) WITH CHECK (public.is_studio_admin());

CREATE POLICY documents_studio_select ON public.documents FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY documents_studio_write ON public.documents FOR ALL TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY email_logs_studio_select ON public.email_logs FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY email_logs_studio_insert ON public.email_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());
CREATE POLICY email_logs_studio_update ON public.email_logs FOR UPDATE TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY reminder_events_studio_select ON public.reminder_events FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY reminder_events_studio_write ON public.reminder_events FOR ALL TO authenticated
  USING (public.is_studio_user()) WITH CHECK (public.is_studio_user());

CREATE POLICY activity_logs_studio_select ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY activity_logs_studio_insert ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_user());

CREATE POLICY settings_studio_select ON public.settings FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY settings_studio_update ON public.settings FOR UPDATE TO authenticated
  USING (public.is_studio_admin()) WITH CHECK (public.is_studio_admin());

CREATE POLICY number_counters_studio_select ON public.number_counters FOR SELECT TO authenticated
  USING (public.is_studio_user());
CREATE POLICY number_counters_studio_write ON public.number_counters FOR ALL TO authenticated
  USING (public.is_studio_admin()) WITH CHECK (public.is_studio_admin());

CREATE POLICY webhook_events_studio_select ON public.webhook_events FOR SELECT TO authenticated
  USING (public.is_studio_admin());
CREATE POLICY webhook_events_studio_insert ON public.webhook_events FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_admin());
CREATE POLICY webhook_events_studio_update ON public.webhook_events FOR UPDATE TO authenticated
  USING (public.is_studio_admin()) WITH CHECK (public.is_studio_admin());

-- Grants for Data API roles (RLS still applies)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON public.client_financial_summary TO authenticated, service_role;
GRANT SELECT ON public.invoice_status_summary TO authenticated, service_role;

-- anon has table SELECT grants but NO permissive policies → RLS denies all business reads.
-- Public proposal/invoice access is via server token endpoints (Phase 10), not PostgREST anon policies.
