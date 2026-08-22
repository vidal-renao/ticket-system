-- ROLLBACK for supabase/migrations/202608150001_schema_prefix_hd.sql
--
-- Exact inverse. Renames the seven tables back and restores the five function
-- bodies to their pre-rename text, character for character as captured from
-- production with pg_get_functiondef() before the change.
--
-- Run it the same way as the forward migration: as a single transaction, in
-- the Supabase SQL editor. If it commits, the database is back to the state it
-- was in before the rename.
--
-- NOTHING ELSE HAS TO BE UNDONE. The forward migration changes only table
-- names and five function bodies; it does not drop, create, or alter any
-- column, constraint, index, policy, trigger or grant. Publication membership
-- follows the tables back by OID exactly as it followed them forward.
--
-- THE CODE MUST GO BACK TOO. This rollback returns the database to the old
-- names, so the deployed ticket-system and vidal-helpdesk-mcp must be rolled
-- back to their pre-hd_ commits as well. Database and code are one change in
-- two places; rolling back one without the other is the outage this file
-- exists to prevent.

begin;

-- 1. The seven tables, back. -------------------------------------------------
do $hd_rollback$
begin
  if to_regclass('public.hd_tickets') is null then
    raise notice 'hd_ rollback: public.hd_tickets not present, nothing to do';
    return;
  end if;

  alter table public.hd_tickets            rename to tickets;
  alter table public.hd_profiles           rename to profiles;
  alter table public.hd_notifications      rename to notifications;
  alter table public.hd_ticket_comments    rename to ticket_comments;
  alter table public.hd_ticket_audit_logs  rename to ticket_audit_logs;
  alter table public.hd_ai_analysis        rename to ai_analysis;
  alter table public.hd_customers_info     rename to customers_info;
end
$hd_rollback$;

-- 2. The five function bodies, back. -----------------------------------------

create or replace function private_public.current_profile_org_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$function$;

create or replace function private_public.current_profile_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  SELECT role::text
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$function$;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

create or replace function public.rve_set_reference_code()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
DECLARE
  v_role_code TEXT;
  v_candidate TEXT;
  v_attempt INTEGER := 0;
BEGIN
  IF NEW.reference_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_role_code := public.rve_role_code(NEW.role, NEW.customer_type);
  IF v_role_code IS NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := 'VRE-' || v_role_code || '-' || public.rve_random_suffix();
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE reference_code = v_candidate) THEN
      NEW.reference_code := v_candidate;
      RETURN NEW;
    END IF;
    IF v_attempt >= 20 THEN
      RAISE EXCEPTION 'RVE_REFERENCE_CODE_COLLISION_EXHAUSTED: could not generate a unique reference_code after % attempts', v_attempt;
    END IF;
  END LOOP;
END;
$function$;

-- trg_auto_assign_on_ai_analysis is deliberately NOT restored.
--
-- When this rollback was written it recreated the function verbatim, broken
-- call and all, on the principle that a rollback reproduces the previous state
-- rather than quietly fixing an unrelated defect. That principle still holds,
-- but the state it was reproducing no longer exists: migration
-- 202608220001_drop_legacy_assign_trigger.sql has since dropped the function
-- and its trigger, finishing the routing handover begun on 2026-07-19.
--
-- Restoring it here would resurrect a trigger that calls a function nobody
-- has, and destroy an AI analysis row every time one is written for an
-- unassigned ticket. Undoing the hd_ prefix must not do that.
--
-- Routing lives in lib/ticket-routing.ts (findAutomaticAssignment), which is
-- unaffected by table names and by this rollback.

-- 3. Realtime publication. ---------------------------------------------------
-- Same safety net as the forward migration, under the old names.
do $hd_rollback_publication$
declare
  target_table text;
begin
  foreach target_table in array array[
    'tickets', 'ticket_comments', 'ticket_audit_logs', 'notifications'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
      raise notice 'hd_ rollback: re-added %s to supabase_realtime', target_table;
    end if;
  end loop;
end
$hd_rollback_publication$;

-- 4. Assert the old state is back before committing. -------------------------
do $hd_rollback_assert$
declare
  missing text;
  leftover text;
  bad_fn text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['tickets','profiles','notifications','ticket_comments',
                    'ticket_audit_logs','ai_analysis','customers_info']) t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'hd_ rollback: missing restored tables: %', missing;
  end if;

  select string_agg(t, ', ') into leftover
  from unnest(array['hd_tickets','hd_profiles','hd_notifications','hd_ticket_comments',
                    'hd_ticket_audit_logs','hd_ai_analysis','hd_customers_info']) t
  where to_regclass('public.' || t) is not null;
  if leftover is not null then
    raise exception 'hd_ rollback: prefixed names still present: %', leftover;
  end if;

  select string_agg(n.nspname || '.' || p.proname, ', ') into bad_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private_public')
    and regexp_replace(p.prosrc, '[\r\n\t]+', ' ', 'g')
        ~* '\m(from|join|into|update|exists\s*\(\s*select\s+1\s+from)\s+(public\.)?hd_(tickets|profiles|notifications|ticket_comments|ticket_audit_logs|ai_analysis|customers_info)\M';
  if bad_fn is not null then
    raise exception 'hd_ rollback: functions still reading prefixed names: %', bad_fn;
  end if;

  raise notice 'hd_ rollback: 7 tables restored, 4 functions restored, publication verified';
end
$hd_rollback_assert$;

commit;
