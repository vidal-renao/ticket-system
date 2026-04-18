-- ============================================================
-- RLS FIX: profiles_select_own
-- Problem: users with organization_id = NULL could not read
--          their own profile because the only SELECT policy was
--          "users_read_same_org_profiles" which evaluates
--          NULL = NULL as UNKNOWN (not TRUE) in PostgreSQL.
-- Effect:  login route saw profile = null → role defaulted to
--          'customer' for everyone, breaking admin/agent access.
-- Run on: Supabase SQL Editor
-- ============================================================

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT
  USING (id = auth.uid());
