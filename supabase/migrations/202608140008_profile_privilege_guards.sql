-- Phase 5: prevent profile self-promotion and open self-enrollment
-- Defense in depth alongside application authorization.
--
-- Changes:
-- 1. Drop permissive self-insert on profiles (only active admins may insert).
-- 2. Own-row UPDATE may change display_name/email only — not role, status, auth_user_id.
-- 3. Admins may update other profiles (including role/status) via separate policy.
-- 4. BEFORE UPDATE trigger hard-blocks privilege escalation for non-admins.

-- Replace insert: no more "auth_user_id = auth.uid()" self-enrollment
DROP POLICY IF EXISTS profiles_admin_insert ON public.profiles;
CREATE POLICY profiles_admin_insert
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_studio_admin());

-- Replace own update: still require own row, but trigger enforces column lockdown
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Admins may update any profile (role/status changes for team management)
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_studio_admin())
  WITH CHECK (public.is_studio_admin());

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / table owner bypasses JWT claims; allow bootstrap & migrations.
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'authenticated'
     AND current_setting('request.jwt.claim.sub', true) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Active studio admins may change role/status/auth linkage.
  IF public.is_studio_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'cannot change auth_user_id'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'cannot change role'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'cannot change status'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_profile_privilege_escalation() IS
  'Blocks non-admin updates to profiles.role, profiles.status, and profiles.auth_user_id.';

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC;
