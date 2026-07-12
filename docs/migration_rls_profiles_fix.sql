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
SET row_security = off
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
SET row_security = off
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

-- Replace the most common dependent policies that still query profiles directly.
-- This keeps the whole tenant model consistent and avoids reintroducing recursion
-- through tables that rely on profile org/role checks.

DROP POLICY IF EXISTS "org_members_can_read_own_org" ON organizations;
DROP POLICY IF EXISTS "org_members_read_own_org" ON organizations;
DROP POLICY IF EXISTS "admins_can_update_own_org" ON organizations;
DROP POLICY IF EXISTS "admins_update_own_org" ON organizations;

CREATE POLICY "org_members_read_own_org" ON organizations
  FOR SELECT
  USING (id = public.current_profile_org_id());

CREATE POLICY "admins_update_own_org" ON organizations
  FOR UPDATE
  USING (
    id = public.current_profile_org_id()
    AND public.current_profile_role() = 'admin'
  )
  WITH CHECK (
    id = public.current_profile_org_id()
    AND public.current_profile_role() = 'admin'
  );

DROP POLICY IF EXISTS "org_members_read_categories" ON categories;
DROP POLICY IF EXISTS "admins_write_categories" ON categories;

CREATE POLICY "org_members_read_categories" ON categories
  FOR SELECT
  USING (organization_id = public.current_profile_org_id());

CREATE POLICY "admins_write_categories" ON categories
  FOR ALL
  USING (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('admin', 'manager')
  );

DROP POLICY IF EXISTS "org_members_read_sla" ON sla_policies;

CREATE POLICY "org_members_read_sla" ON sla_policies
  FOR SELECT
  USING (organization_id = public.current_profile_org_id());

DROP POLICY IF EXISTS "customers_own_tickets" ON tickets;
DROP POLICY IF EXISTS "staff_org_tickets" ON tickets;
DROP POLICY IF EXISTS "customers_create_tickets" ON tickets;
DROP POLICY IF EXISTS "staff_update_tickets" ON tickets;

CREATE POLICY "customers_own_tickets" ON tickets
  FOR SELECT
  USING (
    created_by = auth.uid()
    AND public.current_profile_role() = 'customer'
  );

CREATE POLICY "staff_org_tickets" ON tickets
  FOR SELECT
  USING (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  );

CREATE POLICY "customers_create_tickets" ON tickets
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id = public.current_profile_org_id()
  );

CREATE POLICY "staff_update_tickets" ON tickets
  FOR UPDATE
  USING (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  )
  WITH CHECK (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('agent', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "internal_comments_staff_only" ON ticket_comments;
DROP POLICY IF EXISTS "members_create_comments" ON ticket_comments;

CREATE POLICY "internal_comments_staff_only" ON ticket_comments
  FOR SELECT
  USING (
    is_internal = FALSE
    OR public.current_profile_role() IN ('agent', 'manager', 'admin')
  );

CREATE POLICY "members_create_comments" ON ticket_comments
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM tickets t
      WHERE t.id = ticket_id
        AND (
          t.created_by = auth.uid()
          OR t.organization_id = public.current_profile_org_id()
        )
    )
  );

DO $$
BEGIN
  IF to_regclass('public.ticket_attachments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "members_read_attachments" ON ticket_attachments;

    CREATE POLICY "members_read_attachments" ON ticket_attachments
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM tickets t
          WHERE t.id = ticket_id
            AND (
              t.created_by = auth.uid()
              OR t.organization_id = public.current_profile_org_id()
            )
        )
      );
  END IF;
END $$;

DROP POLICY IF EXISTS "staff_read_ai_analysis" ON ai_analysis;

CREATE POLICY "staff_read_ai_analysis" ON ai_analysis
  FOR SELECT
  USING (public.current_profile_role() IN ('agent', 'manager', 'admin'));

DROP POLICY IF EXISTS "managers_read_audit_logs" ON audit_logs;

CREATE POLICY "managers_read_audit_logs" ON audit_logs
  FOR SELECT
  USING (
    organization_id = public.current_profile_org_id()
    AND public.current_profile_role() IN ('manager', 'admin')
  );
