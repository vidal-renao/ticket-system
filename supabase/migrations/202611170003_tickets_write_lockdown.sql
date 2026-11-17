-- hd_tickets: no direct writes. hd_ticket_audit_logs: append-only.
--
-- Spec REQ-F1-04 and REQ-F1-05 (audit 2026-11-16: SEC-05 / DOM-20, SEC-07).
--
-- *************************************************************************
-- DEPLOY ORDER -- READ BEFORE APPLYING
-- The application code that creates portal tickets with service_role
-- (app/api/tickets/route.ts, Phase 1) MUST be deployed to production BEFORE
-- this migration is applied. Until then that route inserts with the user's
-- session, and after the REVOKE below every new ticket fails with
-- "permission denied for table hd_tickets".
-- *************************************************************************
--
-- 1. hd_tickets
--    `authenticated` held INSERT and UPDATE on every column, bounded only by
--    RLS. Every application write to this table goes through service_role in
--    an API route that checks the caller, so the grants bought nothing and
--    left the ticket open to being changed straight through PostgREST with a
--    user's own JWT -- status, assignee, SLA flags and all.
--      * REVOKE INSERT, UPDATE, DELETE, TRUNCATE from anon and authenticated.
--      * Drop the INSERT, UPDATE and DELETE policies, which can no longer
--        match anything. They are found by command in pg_policies rather than
--        by name, because the deployed names are not all in this repository
--        (known: tickets_update_enterprise_scope from 202608040001 and
--        customers_create_tickets).
--      * SELECT policies and the SELECT grant are not touched. A policy
--        declared FOR ALL is not dropped either, because it also carries read
--        access; it is reported with a NOTICE and is inert for writes without
--        the grants.
--      * The trigger tickets_customer_update_guard stays: it costs nothing and
--        still holds if a grant is ever restored by mistake.
--
-- 2. hd_ticket_audit_logs
--    An audit trail that can be edited is not one. UPDATE, DELETE and
--    TRUNCATE are now rejected for every role -- service_role, the table
--    owner and superusers included -- by triggers raising SQLSTATE 'HD001',
--    and the same three privileges are revoked from anon, authenticated and
--    service_role. INSERT is unchanged.
--
--    CONSEQUENCES, deliberate:
--      * No clean-up job can delete audit rows. Retention (nDSG) must be an
--        explicit, reviewed migration that disables the trigger for its own
--        transaction:
--          alter table public.hd_ticket_audit_logs disable trigger hd_ticket_audit_logs_immutable;
--          -- delete ...;
--          alter table public.hd_ticket_audit_logs enable trigger hd_ticket_audit_logs_immutable;
--      * A foreign key on this table with ON DELETE SET NULL or CASCADE
--        (actor_id -> hd_profiles, organization_id -> organizations, as in the
--        legacy schema) now makes the *parent* delete fail when audit rows
--        reference it, because the cascade is an UPDATE/DELETE of this table.
--        The application never hard-deletes a profile that has acted
--        (accounts are soft-deleted, 202608260001), so nothing changes in
--        practice; a manual hard delete of such a profile or organization
--        will now be refused, which is the point.
--
-- IDEMPOTENCY: REVOKE is repeatable; DROP POLICY / DROP TRIGGER IF EXISTS;
-- CREATE OR REPLACE for the function.
--
-- ROLLBACK (restores the pre-migration exposure -- emergency only):
--   begin;
--   drop trigger if exists hd_ticket_audit_logs_immutable on public.hd_ticket_audit_logs;
--   drop trigger if exists hd_ticket_audit_logs_no_truncate on public.hd_ticket_audit_logs;
--   grant update, delete on public.hd_ticket_audit_logs to service_role;
--   grant insert, update on public.hd_tickets to authenticated;
--   -- then re-run supabase/migrations/202608040001_tickets_write_policies.sql
--   -- (recreates tickets_update_enterprise_scope) and recreate any INSERT
--   -- policy from the pg_policies snapshot taken before applying. Take it:
--   --   select * from pg_policies where schemaname = 'public' and tablename = 'hd_tickets';
--   -- public.hd_reject_audit_mutation() is shared with hd_admin_audit_logs
--   -- (202611170004); drop it only if that table's triggers are gone too.
--   commit;

begin;

-- ---------------------------------------------------------------------------
-- 1. hd_tickets
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.hd_tickets from anon, authenticated;

do $policies$
declare
  v_policy record;
begin
  for v_policy in
    select policyname, cmd
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'hd_tickets'
  loop
    if v_policy.cmd in ('INSERT', 'UPDATE', 'DELETE') then
      execute format('drop policy if exists %I on public.hd_tickets', v_policy.policyname);
      raise notice 'tickets write lockdown: dropped % policy % on hd_tickets', v_policy.cmd, v_policy.policyname;
    elsif v_policy.cmd = 'ALL' then
      raise notice 'tickets write lockdown: policy % on hd_tickets is FOR ALL and was left in place (it also grants read access); it no longer permits writes because the grants are gone', v_policy.policyname;
    end if;
  end loop;
end
$policies$;

-- ---------------------------------------------------------------------------
-- 2. Append-only audit trail
-- ---------------------------------------------------------------------------
create or replace function public.hd_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'HD001',
          hint = 'Audit rows are immutable for every role. Retention must be an explicit migration.';
end;
$function$;

revoke all on function public.hd_reject_audit_mutation() from public, anon, authenticated;

drop trigger if exists hd_ticket_audit_logs_immutable on public.hd_ticket_audit_logs;
create trigger hd_ticket_audit_logs_immutable
  before update or delete on public.hd_ticket_audit_logs
  for each row
  execute function public.hd_reject_audit_mutation();

drop trigger if exists hd_ticket_audit_logs_no_truncate on public.hd_ticket_audit_logs;
create trigger hd_ticket_audit_logs_no_truncate
  before truncate on public.hd_ticket_audit_logs
  for each statement
  execute function public.hd_reject_audit_mutation();

revoke update, delete, truncate on public.hd_ticket_audit_logs from anon, authenticated, service_role;

commit;
