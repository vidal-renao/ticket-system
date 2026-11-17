-- Applied 2026-07-19 in production.
--
-- This Supabase project is shared with other apps. The pre-existing
-- public.audit_logs table turned out to belong to a different one — its
-- columns (owner_user_id, entity_type, entity_id, action, detail) share
-- nothing with what ticket-system writes/reads. Every ticket-system audit
-- insert (review approvals, customer confirmations, archiving, cleanup,
-- SLA breach logging) has been failing silently against that mismatch, and
-- the SLA breach dedupe guard in lib/sla.ts silently never matched either,
-- causing the same breach notification to be re-sent on every cron run.
--
-- Fix: ticket-system gets its own table instead of touching the other app's.
-- All `.from("audit_logs")` call sites were repointed to `ticket_audit_logs`.

CREATE TABLE IF NOT EXISTS ticket_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role      TEXT,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     UUID,
  old_values      JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_logs_resource
  ON ticket_audit_logs (resource_type, resource_id, action);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_logs_org
  ON ticket_audit_logs (organization_id, created_at DESC);

ALTER TABLE ticket_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ticket_audit_logs' AND policyname='ticket_audit_logs_staff_read') THEN
    CREATE POLICY "ticket_audit_logs_staff_read" ON ticket_audit_logs
      FOR SELECT TO authenticated
      USING (
        organization_id IN (
          SELECT organization_id FROM profiles
          WHERE id = auth.uid() AND role IN ('agent', 'manager', 'admin')
        )
      );
  END IF;
END $$;
