-- Minimal legacy-schema stand-in for the Phase 0 hardening suites
-- (ai_quota.sql, customers_info_rls.sql), following the same pattern as
-- tickets_write_base.sql: just enough of the historically ad-hoc-applied core
-- schema for 202611160001_ai_quota.sql and 202611160002_customers_info_rls.sql
-- to run against and be meaningfully pgTAP-tested.
--
-- The four codex_* policies are a transcription of the *shape* reported by the
-- 2026-11-16 audit (owner OR any admin/agent, no organization filter) so the
-- migration is exercised against what it replaces. All identifiers are
-- fictitious.
\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path = pg_catalog, public, extensions;

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
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::json->>'sub'
  )::uuid;
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.hd_profiles (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),
  role text NOT NULL CHECK (role IN ('customer', 'agent', 'manager', 'admin')),
  full_name text,
  is_active boolean DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hd_customers_info (
  id uuid PRIMARY KEY REFERENCES public.hd_profiles(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT '',
  industry text NOT NULL DEFAULT '',
  business_details text NOT NULL DEFAULT '',
  tax_id text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Identity helpers, same definitions as tickets_write_base.sql.
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT role::text FROM public.hd_profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT organization_id FROM public.hd_profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_org_id() TO authenticated, service_role;

ALTER TABLE public.hd_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.hd_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- The policies being replaced: owner OR any admin/agent of any organization.
ALTER TABLE public.hd_customers_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY codex_select_291c6b92 ON public.hd_customers_info FOR SELECT
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.hd_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent')));
CREATE POLICY codex_insert_aeb45ea5 ON public.hd_customers_info FOR INSERT
  WITH CHECK (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.hd_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent')));
CREATE POLICY codex_update_dba0d651 ON public.hd_customers_info FOR UPDATE
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.hd_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent')));
CREATE POLICY codex_delete_794ec07 ON public.hd_customers_info FOR DELETE
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.hd_profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent')));

GRANT SELECT ON public.organizations, public.hd_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hd_customers_info TO authenticated;
GRANT ALL ON public.organizations, public.hd_profiles, public.hd_customers_info TO service_role;

-- ---------------------------------------------------------------------------
-- Seed: two organizations. A = ...00a0, B = ...00b0.
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, slug) VALUES
  ('00000000-0000-4000-8000-0000000000a0', 'CI Org A', 'ci-org-a'),
  ('00000000-0000-4000-8000-0000000000b0', 'CI Org B', 'ci-org-b');

INSERT INTO public.hd_profiles (id, organization_id, role, full_name) VALUES
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a0', 'admin',    'A Admin'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a0', 'agent',    'A Agent'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a0', 'manager',  'A Manager'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0', 'customer', 'A Customer 1'),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a0', 'customer', 'A Customer 2'),
  ('00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a0', 'customer', 'A Customer without info'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b0', 'admin',    'B Admin'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b0', 'agent',    'B Agent'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b0', 'customer', 'B Customer'),
  ('00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000b0', 'customer', 'B Customer without info'),
  -- An account on the shared instance that belongs to no organization.
  ('00000000-0000-4000-8000-0000000000f1', NULL, 'agent', 'Orphan Agent');

INSERT INTO public.hd_profiles (id, organization_id, role, full_name, is_active, deleted_at) VALUES
  ('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000a0', 'customer', 'A Frozen',  false, NULL),
  ('00000000-0000-4000-8000-0000000000a8', '00000000-0000-4000-8000-0000000000a0', 'customer', 'A Deleted', true,  now());

INSERT INTO public.hd_customers_info (id, company_name, tax_id) VALUES
  ('00000000-0000-4000-8000-0000000000a4', 'A Company 1', 'CHE-000.000.001'),
  ('00000000-0000-4000-8000-0000000000a5', 'A Company 2', 'CHE-000.000.002'),
  ('00000000-0000-4000-8000-0000000000b4', 'B Company',   'CHE-000.000.003');
