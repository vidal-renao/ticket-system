-- hd_customers_info: tenant isolation for the four RLS policies.
--
-- The deployed policies (codex_select_291c6b92, codex_insert_aeb45ea5,
-- codex_update_dba0d651, codex_delete_794ec07) each allow the row's owner OR
--
--   EXISTS (SELECT 1 FROM hd_profiles p
--            WHERE p.id = auth.uid() AND p.role IN ('admin', 'agent'))
--
-- with no organization filter. On an instance that holds more than one
-- organization, any agent or admin of any tenant can therefore read, change
-- and delete the company data (legal name, tax id) of every other tenant's
-- customers straight through PostgREST with their own JWT (audit 2026-11-16,
-- SEC-03; spec REQ-F0-05).
--
-- NEW RULES
-- ---------
--   SELECT          the customer's own row, or staff (agent, manager, admin)
--                   of the same organization as the customer
--   INSERT, UPDATE  the customer's own row, or an admin of the same organization
--   DELETE          an admin of the same organization
--
-- hd_customers_info has no organization_id; the tenant is the organization of
-- the hd_profiles row with the same id. That lookup lives in a SECURITY
-- DEFINER helper so the policy does not depend on what hd_profiles RLS lets
-- the caller see.
--
-- THE APPLICATION IS NOT AFFECTED: every application write to this table goes
-- through service_role (settings, customer-actions, admin/users,
-- admin/customers/company, auth/register), which bypasses RLS.
--
-- IDEMPOTENCY: DROP POLICY IF EXISTS before each CREATE; CREATE OR REPLACE for
-- the helper.
--
-- ROLLBACK (restores the pre-migration, non-isolated behaviour -- only as an
-- emergency measure):
--   begin;
--   drop policy if exists hd_customers_info_select on public.hd_customers_info;
--   drop policy if exists hd_customers_info_insert on public.hd_customers_info;
--   drop policy if exists hd_customers_info_update on public.hd_customers_info;
--   drop policy if exists hd_customers_info_delete on public.hd_customers_info;
--   -- then recreate codex_select_291c6b92 / codex_insert_aeb45ea5 /
--   -- codex_update_dba0d651 / codex_delete_794ec07 from the pg_policies
--   -- snapshot taken before applying (take it: select * from pg_policies
--   -- where tablename = 'hd_customers_info';)
--   drop function if exists public.hd_is_same_org_profile(uuid);
--   commit;

begin;

-- The policies below stand on these two helpers. Refuse to continue if they
-- are missing or are not what the policies assume: a SECURITY INVOKER helper
-- would evaluate under the caller's RLS, and one without a pinned search_path
-- can be redirected.
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
      raise exception 'customers_info RLS: required helper public.%() is missing', v_name;
    end if;

    -- Production shape: public.<name>() is a thin SECURITY INVOKER wrapper
    -- around private_public.<name>(), which is the SECURITY DEFINER one. The
    -- function that actually reads hd_profiles is the one that must be
    -- DEFINER with a pinned search_path.
    v_target := v_public;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_public) then
      if to_regnamespace('private_public') is not null then
        v_private := to_regprocedure(format('private_public.%I()', v_name));
      end if;
      if v_private is null then
        raise exception 'customers_info RLS: public.%() is SECURITY INVOKER and has no private_public counterpart', v_name;
      end if;
      v_target := v_private;
    end if;

    select p.prosecdef, p.proconfig into v_proc
      from pg_catalog.pg_proc p
     where p.oid = v_target;
    if not v_proc.prosecdef then
      raise exception 'customers_info RLS: % must be SECURITY DEFINER', v_target;
    end if;
    if not exists (
      select 1 from unnest(coalesce(v_proc.proconfig, array[]::text[])) c
       where c like 'search_path=%'
    ) then
      raise exception 'customers_info RLS: % must pin search_path', v_target;
    end if;
    v_private := null;
  end loop;
end
$precheck$;

-- Is this profile in the caller's organization? Answers only yes/no for a
-- given id, so it discloses nothing beyond membership of the caller's own
-- tenant. NULL organization on either side is never a match.
create or replace function public.hd_is_same_org_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
set row_security = off
as $function$
  select exists (
    select 1
      from public.hd_profiles p
     where p.id = p_profile_id
       and p.organization_id is not null
       and p.organization_id = public.current_profile_org_id()
  );
$function$;

revoke all on function public.hd_is_same_org_profile(uuid) from public, anon;
grant execute on function public.hd_is_same_org_profile(uuid) to authenticated, service_role;

alter table public.hd_customers_info enable row level security;

drop policy if exists codex_select_291c6b92 on public.hd_customers_info;
drop policy if exists codex_insert_aeb45ea5 on public.hd_customers_info;
drop policy if exists codex_update_dba0d651 on public.hd_customers_info;
drop policy if exists codex_delete_794ec07 on public.hd_customers_info;

drop policy if exists hd_customers_info_select on public.hd_customers_info;
drop policy if exists hd_customers_info_insert on public.hd_customers_info;
drop policy if exists hd_customers_info_update on public.hd_customers_info;
drop policy if exists hd_customers_info_delete on public.hd_customers_info;

-- auth.uid() and the role helper are wrapped in (select ...) so the planner
-- evaluates them once per statement instead of once per row.
create policy hd_customers_info_select on public.hd_customers_info
  for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select public.current_profile_role()) in ('agent', 'manager', 'admin')
      and public.hd_is_same_org_profile(id)
    )
  );

create policy hd_customers_info_insert on public.hd_customers_info
  for insert to authenticated
  with check (
    id = (select auth.uid())
    or (
      (select public.current_profile_role()) = 'admin'
      and public.hd_is_same_org_profile(id)
    )
  );

create policy hd_customers_info_update on public.hd_customers_info
  for update to authenticated
  using (
    id = (select auth.uid())
    or (
      (select public.current_profile_role()) = 'admin'
      and public.hd_is_same_org_profile(id)
    )
  )
  with check (
    id = (select auth.uid())
    or (
      (select public.current_profile_role()) = 'admin'
      and public.hd_is_same_org_profile(id)
    )
  );

create policy hd_customers_info_delete on public.hd_customers_info
  for delete to authenticated
  using (
    (select public.current_profile_role()) = 'admin'
    and public.hd_is_same_org_profile(id)
  );

commit;
