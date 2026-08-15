-- Minimal legacy-schema stand-in for the hd_tickets write-path suite, following
-- the same pattern as identity_legacy_base.sql / rag_legacy_base.sql: just
-- enough of the historically ad-hoc-applied core schema for
-- 202608040001_tickets_write_policies.sql and
-- 202608040002_fix_customer_update_guard.sql to run against and be
-- meaningfully pgTAP-tested.
--
-- The SELECT/INSERT policies and the current_profile_* helpers below are
-- transcriptions of what is deployed in production (verified against
-- pg_policies / pg_get_functiondef), because the whole point of the suite is
-- that the new UPDATE policy and guard behave correctly *next to* them.
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

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- Production reads request.jwt.claims->>'sub'; the CI stand-in accepts the
-- legacy singular GUC as well so tests can set either form.
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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hd_tickets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ticket_number bigserial,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_by uuid NOT NULL REFERENCES public.hd_profiles(id),
  assigned_to uuid REFERENCES public.hd_profiles(id),
  assigned_team_id uuid,
  assigned_at timestamptz,
  assigned_by uuid,
  category_id uuid,
  category text,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  review_status text NOT NULL DEFAULT 'not_requested',
  sla_breached boolean NOT NULL DEFAULT false,
  sla_response_breached boolean NOT NULL DEFAULT false,
  sla_resolution_breached boolean NOT NULL DEFAULT false,
  response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hd_ticket_comments (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.hd_tickets(id),
  author_id uuid NOT NULL REFERENCES public.hd_profiles(id),
  content text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  is_ai_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Identity helpers, transcribed from production
-- ---------------------------------------------------------------------------
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

GRANT EXECUTE ON FUNCTION public.current_profile_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_org_id() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pre-existing policies and grants (the state 202608040001 was written against)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hd_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tickets_read_enterprise_scope ON public.hd_tickets
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND organization_id = current_profile_org_id()
    AND (
      (current_profile_role() = 'customer' AND created_by = auth.uid())
      OR (current_profile_role() = 'agent' AND assigned_to = auth.uid())
      OR current_profile_role() = ANY (ARRAY['manager', 'admin'])
    )
  );

CREATE POLICY customers_create_tickets ON public.hd_tickets
  FOR INSERT
  WITH CHECK (created_by = auth.uid() AND organization_id = current_profile_org_id());

CREATE POLICY ticket_comments_read_authorized ON public.hd_ticket_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.hd_tickets ticket
      WHERE ticket.id = hd_ticket_comments.ticket_id
        AND ticket.deleted_at IS NULL
        AND ticket.organization_id = current_profile_org_id()
    )
  );

CREATE POLICY ticket_comments_create_authorized ON public.hd_ticket_comments
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.hd_tickets ticket
      WHERE ticket.id = hd_ticket_comments.ticket_id
        AND ticket.deleted_at IS NULL
        AND ticket.organization_id = current_profile_org_id()
    )
  );

-- Historical grant state: SELECT/INSERT only. The authenticated role never had
-- UPDATE on hd_tickets nor INSERT on hd_ticket_comments — that is what
-- 202608040001 adds, and anon's write grants are what it revokes.
GRANT SELECT, INSERT ON public.hd_tickets TO authenticated;
GRANT SELECT ON public.hd_ticket_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hd_tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hd_ticket_comments TO anon;
GRANT ALL ON public.hd_tickets, public.hd_ticket_comments, public.hd_profiles, public.organizations TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Seed: one organization, one admin, one customer, one ticket
-- ---------------------------------------------------------------------------
INSERT INTO public.organizations (id, name, slug) VALUES
  ('921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'Vidal Real Estate', 'vidal-real-estate');

INSERT INTO public.hd_profiles (id, organization_id, role, full_name) VALUES
  ('00000000-0000-4000-8000-0000000000ad', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'admin', 'CI Admin'),
  ('00000000-0000-4000-8000-0000000000cc', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'customer', 'CI Customer'),
  ('00000000-0000-4000-8000-0000000000a9', '921f56a8-b2fe-4f24-bae9-fdf4863d4240', 'agent', 'CI Agent');

INSERT INTO public.hd_tickets (id, organization_id, created_by, assigned_to, title, status, priority) VALUES
  ('00000000-0000-4000-8000-000000007c01', '921f56a8-b2fe-4f24-bae9-fdf4863d4240',
   '00000000-0000-4000-8000-0000000000cc', '00000000-0000-4000-8000-0000000000a9',
   'CI ticket', 'open', 'medium');
