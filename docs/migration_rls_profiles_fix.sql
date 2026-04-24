-- ============================================================
-- RLS FIX: profiles recursion / self-read / org lookup
-- Problem:
--   Existing policies on profiles query profiles again:
--     - users_read_same_org_profiles
--     - admins_manage_profiles
--   That can trigger:
--     infinite recursion detected in policy for relation "profiles"
--
-- Effect:
--   - ticket creation can fail with "User has no organization"
--   - comment replies can fail
--   - profile and organization lookups become unstable
--
-- Run on:
--   Supabase SQL Editor (production + any affected environments)
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_profile_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "users_read_same_org_profiles" ON profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "admins_manage_profiles" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "users_read_same_org_profiles" ON profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR organization_id = public.current_profile_org_id()
  );

CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "admins_manage_profiles" ON profiles
  FOR ALL
  USING (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('admin', 'manager')
  );
