-- Applied 2026-07-19 (both statements already executed in production).

-- 1) The legacy DB-side auto-assignment trigger referenced the nonexistent
--    tickets.updated_at column, making every unassigned ticket INSERT fail
--    ("column updated_at of relation tickets does not exist"). Routing is
--    owned by the application layer (app/api/tickets POST + AI triage
--    follow-up), which respects routing_override and current notification
--    types, so the trigger is dropped rather than patched.
DROP TRIGGER IF EXISTS tickets_auto_assign ON tickets;
DROP FUNCTION IF EXISTS assign_ticket_to_agent(uuid);

-- 2) Align the deployed schema with lib/supabase/types.ts: application
--    queries select profiles.created_at (team directory, member profile) and
--    failed silently because the column never existed in this environment.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
