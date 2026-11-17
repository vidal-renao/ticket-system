-- hd_admin_audit_logs: persistent, append-only trail of administrative actions.
--
-- Spec REQ-F1-06, decision D7-A (DECISIONS.md ADR-019; audit 2026-11-16,
-- SEC-08). Role changes, account creation, freeze, soft-delete and restore,
-- issued access links, customer onboarding and the PII setting left no
-- persistent record; hd_ticket_audit_logs is keyed to a ticket and cannot hold
-- them.
--
-- TABLE (this column list is a contract: the MCP server writes to it too)
--   id               bigint generated always as identity primary key
--   organization_id  uuid not null  -> organizations(id)
--   actor_id         uuid null      -> hd_profiles(id)   (null for system / mcp)
--   actor_type       text not null  'user' | 'system' | 'mcp'
--   action           text not null  e.g. 'user.role_changed'
--   target_type      text null      e.g. 'user', 'organization', 'ticket'
--   target_id        text null      text, so it can name any kind of target
--   outcome          text not null  'success' | 'failure', default 'success'
--   details          jsonb not null default '{}'  -- never links, passwords, emails
--   created_at       timestamptz not null default now()
--   index (organization_id, created_at desc)
--
-- AUTHORIZATION
--   SELECT   administrators, rows of their own organization only (RLS)
--   INSERT   service_role only (lib/admin-audit.ts, the MCP server). anon and
--            authenticated have no write privilege and no write policy.
--   UPDATE, DELETE, TRUNCATE   nobody. Rejected by trigger for every role,
--            service_role and the owner included (SQLSTATE 'HD001'), exactly
--            like hd_ticket_audit_logs in 202611170003; the privileges are
--            revoked from service_role as well.
--
-- CONSEQUENCE of the foreign keys (NO ACTION) together with immutability: a
-- profile that appears as actor_id, or an organization with audit rows, cannot
-- be hard-deleted. The application soft-deletes accounts, so this is the
-- intended behaviour, not a new restriction on it.
--
-- The policy stands on public.current_profile_role() and
-- public.current_profile_org_id(), verified below as in 202611160002: in
-- production they are SECURITY INVOKER wrappers over the SECURITY DEFINER
-- functions in private_public.
--
-- CAN BE APPLIED BEFORE OR AFTER THE CODE: lib/admin-audit.ts never throws, so
-- until this table exists the events are only in the server log.
--
-- IDEMPOTENCY: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY / TRIGGER IF
-- EXISTS before CREATE, CREATE OR REPLACE for the function.
--
-- ROLLBACK (destroys the audit trail -- export it first):
--   begin;
--   drop table if exists public.hd_admin_audit_logs;
--   -- public.hd_reject_audit_mutation() is shared with hd_ticket_audit_logs
--   -- (202611170003); leave it unless that migration is rolled back too.
--   commit;

begin;

do $precheck$
declare
  v_name text;
  v_public regprocedure;
  v_private regprocedure;
  v_target regprocedure;
  v_proc record;
begin
  foreach v_name in array array['current_profile_role', 'current_profile_org_id']
  loop
    v_public := to_regprocedure(format('public.%I()', v_name));
    if v_public is null then
      raise exception 'admin audit logs: required helper public.%() is missing', v_name;
    end if;

    v_target := v_public;
    v_private := null;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_public) then
      if to_regnamespace('private_public') is not null then
        v_private := to_regprocedure(format('private_public.%I()', v_name));
      end if;
      if v_private is null then
        raise exception 'admin audit logs: public.%() is SECURITY INVOKER and has no private_public counterpart', v_name;
      end if;
      v_target := v_private;
    end if;

    select p.prosecdef, p.proconfig into v_proc
      from pg_catalog.pg_proc p
     where p.oid = v_target;
    if not v_proc.prosecdef then
      raise exception 'admin audit logs: % must be SECURITY DEFINER', v_target;
    end if;
    if not exists (
      select 1 from unnest(coalesce(v_proc.proconfig, array[]::text[])) c
       where c like 'search_path=%'
    ) then
      raise exception 'admin audit logs: % must pin search_path', v_target;
    end if;
  end loop;
end
$precheck$;

create table if not exists public.hd_admin_audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_id uuid null references public.hd_profiles(id),
  actor_type text not null check (actor_type in ('user', 'system', 'mcp')),
  action text not null,
  target_type text null,
  target_id text null,
  outcome text not null default 'success' check (outcome in ('success', 'failure')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.hd_admin_audit_logs is
  'Append-only audit trail of administrative actions. Written with service_role only; readable by administrators of the same organization.';

create index if not exists hd_admin_audit_logs_org_created_idx
  on public.hd_admin_audit_logs (organization_id, created_at desc);

alter table public.hd_admin_audit_logs enable row level security;

drop policy if exists hd_admin_audit_logs_select_admin on public.hd_admin_audit_logs;
create policy hd_admin_audit_logs_select_admin on public.hd_admin_audit_logs
  for select to authenticated
  using (
    (select public.current_profile_role()) = 'admin'
    and organization_id = (select public.current_profile_org_id())
  );

-- Supabase's default privileges grant everything on a new public table to
-- anon, authenticated and service_role. Start from nothing.
revoke all on public.hd_admin_audit_logs from public, anon, authenticated, service_role;
grant select on public.hd_admin_audit_logs to authenticated;
grant select, insert on public.hd_admin_audit_logs to service_role;

-- Same function as 202611170003, repeated so this migration does not depend
-- on that one having been applied.
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

drop trigger if exists hd_admin_audit_logs_immutable on public.hd_admin_audit_logs;
create trigger hd_admin_audit_logs_immutable
  before update or delete on public.hd_admin_audit_logs
  for each row
  execute function public.hd_reject_audit_mutation();

drop trigger if exists hd_admin_audit_logs_no_truncate on public.hd_admin_audit_logs;
create trigger hd_admin_audit_logs_no_truncate
  before truncate on public.hd_admin_audit_logs
  for each statement
  execute function public.hd_reject_audit_mutation();

commit;
