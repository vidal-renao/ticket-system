-- Legacy-schema stand-in for the Phase 1 suites (sla_cron_support.sql,
-- sla_pg_cron.sql, tickets_write_lockdown.sql, admin_audit_logs.sql).
--
-- Builds on phase0_base.sql (two organizations, identity helpers, roles) and
-- adds just enough of hd_tickets, hd_ticket_audit_logs and hd_notifications,
-- in the state the 2026-11-16 audit reported, for the 20261117000x migrations
-- to run against what they change:
--   * authenticated holds INSERT and UPDATE on hd_tickets (SEC-05), behind the
--     policies from 202608040001 and the legacy INSERT policy;
--   * hd_ticket_audit_logs has no immutability trigger and grants UPDATE and
--     DELETE to anon and authenticated (SEC-07);
--   * its foreign keys are ON DELETE SET NULL, as in the legacy schema.
-- All identifiers are fictitious.
\set ON_ERROR_STOP on
\ir phase0_base.sql

CREATE TABLE public.hd_tickets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  ticket_number bigserial,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_by uuid NOT NULL REFERENCES public.hd_profiles(id),
  assigned_to uuid REFERENCES public.hd_profiles(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  sla_breached boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hd_ticket_audit_logs (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.hd_profiles(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hd_notifications (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.hd_profiles(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES public.hd_tickets(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  action_url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.hd_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_ticket_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hd_notifications ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY tickets_update_enterprise_scope ON public.hd_tickets
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND organization_id = current_profile_org_id()
    AND (
      (current_profile_role() = 'customer' AND created_by = auth.uid())
      OR (current_profile_role() = 'agent' AND assigned_to = auth.uid())
      OR current_profile_role() = ANY (ARRAY['manager', 'admin'])
    )
  );

-- A legacy policy under a generated name, to prove the migration finds write
-- policies by command and not by a list of known names.
CREATE POLICY codex_delete_0f1e2d3c ON public.hd_tickets
  FOR DELETE TO authenticated
  USING (current_profile_role() = 'admin' AND organization_id = current_profile_org_id());

-- Audit rows: readable and, before Phase 1, writable by any staff member of
-- the organization.
CREATE POLICY audit_staff_all ON public.hd_ticket_audit_logs
  FOR ALL TO authenticated
  USING (organization_id = current_profile_org_id()
         AND current_profile_role() = ANY (ARRAY['agent', 'manager', 'admin']))
  WITH CHECK (organization_id = current_profile_org_id());

CREATE POLICY notifications_own ON public.hd_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.hd_tickets TO authenticated;
GRANT SELECT ON public.hd_tickets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hd_ticket_audit_logs TO anon, authenticated;
GRANT SELECT ON public.hd_notifications TO authenticated;
GRANT ALL ON public.hd_tickets, public.hd_ticket_audit_logs, public.hd_notifications TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Supabase hands every new table in public to the API roles. Reproduced here
-- so the new tables are created into the same default the production project
-- has, and the migrations' REVOKEs are actually exercised.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- Seed: one ticket per organization, each with one audit row.
INSERT INTO public.hd_tickets (id, organization_id, created_by, assigned_to, title) VALUES
  ('00000000-0000-4000-8000-00000000a701', '00000000-0000-4000-8000-0000000000a0',
   '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a2', 'A ticket'),
  ('00000000-0000-4000-8000-00000000b701', '00000000-0000-4000-8000-0000000000b0',
   '00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b2', 'B ticket');

INSERT INTO public.hd_ticket_audit_logs (id, organization_id, actor_id, actor_role, action, resource_type, resource_id) VALUES
  ('00000000-0000-4000-8000-00000000a901', '00000000-0000-4000-8000-0000000000a0',
   '00000000-0000-4000-8000-0000000000a2', 'agent', 'ticket.status_changed', 'ticket',
   '00000000-0000-4000-8000-00000000a701'),
  ('00000000-0000-4000-8000-00000000b901', '00000000-0000-4000-8000-0000000000b0',
   '00000000-0000-4000-8000-0000000000b2', 'agent', 'ticket.status_changed', 'ticket',
   '00000000-0000-4000-8000-00000000b701');
