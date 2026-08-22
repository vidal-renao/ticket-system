-- Finish the routing handover that was started on 2026-07-19.
--
-- docs/migration_fix_ticket_insert_and_profiles.sql moved automatic assignment
-- out of the database and into the application, and said so:
--
--   "Routing is owned by the application layer (app/api/tickets POST + AI
--    triage follow-up), which respects routing_override and current
--    notification types, so the trigger is dropped rather than patched."
--
-- It dropped assign_ticket_to_agent() and the trigger on tickets. It missed
-- the second trigger, on ai_analysis, which called the same function. That
-- trigger has been calling a function that does not exist for a month.
--
-- It only fires on the branch that matters:
--
--   IF EXISTS (SELECT 1 FROM hd_tickets WHERE id = NEW.ticket_id
--              AND assigned_to IS NULL) THEN
--     PERFORM assign_ticket_to_agent(NEW.ticket_id);
--
-- so every AI analysis written for a still-unassigned ticket raised
-- "function assign_ticket_to_agent(uuid) does not exist" AFTER INSERT and took
-- the row down with it. TK-0077 is the clean proof: it ended up assigned --
-- lib/ai/triage-runner.ts assigns it in TypeScript a few lines later -- and
-- has no analysis row at all. TK-0076 survived only because it was already
-- assigned when the insert ran, so the guard skipped.
--
-- Dropped rather than repaired. Recreating assign_ticket_to_agent() would
-- reverse a settled architecture decision and reintroduce a second source of
-- routing truth, and the SQL version never knew what findAutomaticAssignment
-- knows: routing_override, heartbeat-backed availability, load spreading, and
-- the overflow fallback that records unassignedReason.

begin;

drop trigger if exists ai_analysis_auto_assign on public.hd_ai_analysis;

drop function if exists public.trg_auto_assign_on_ai_analysis();

-- Orphaned by the same incomplete cleanup: its trigger (tickets_auto_assign)
-- went in July, the function stayed behind. Nothing calls it.
drop function if exists public.trg_auto_assign_on_ticket_insert();

do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'hd_ai_analysis'
      and t.tgname = 'ai_analysis_auto_assign' and not t.tgisinternal
  ) then
    raise exception 'ai_analysis_auto_assign still present after drop';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('trg_auto_assign_on_ai_analysis', 'trg_auto_assign_on_ticket_insert')
  ) then
    raise exception 'a legacy auto-assign function survived the drop';
  end if;

  -- The guard on hd_tickets is a different trigger and must be untouched:
  -- it enforces what a customer may change on their own ticket.
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'hd_tickets'
      and t.tgname = 'tickets_customer_update_guard' and not t.tgisinternal
  ) then
    raise exception 'tickets_customer_update_guard is missing -- unrelated trigger was affected';
  end if;
end
$$;

commit;
