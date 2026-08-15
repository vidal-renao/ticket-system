-- Phase hd_: prefix the seven HelpDesk tables in `public`.
--
-- WHY
-- ---
-- This Supabase instance is shared. `public` holds tables belonging to at
-- least six different applications, and four of them already namespace
-- themselves by prefix (rag_, waai_, lumen_, jobfit_, rve_). The seven tables
-- below were created before that convention existed and carry names generic
-- enough to be claimed by any other project: `tickets`, `profiles`,
-- `notifications`. `hd_` (HelpDesk) closes that gap.
--
-- Staying in `public` rather than moving to a dedicated schema is a deliberate
-- decision, taken after incident 4A.16.
--
-- WHAT POSTGRES CARRIES ACROSS A RENAME BY ITSELF (verified, not assumed)
-- ----------------------------------------------------------------------
-- Everything that references a table by OID follows it automatically and is
-- NOT touched here:
--   * indexes (34 across the seven tables) and their names
--   * primary keys, unique and check constraints
--   * foreign keys, in both directions -- including the 14 inbound FKs on
--     profiles from other applications' tables, and the rag_* composite FKs
--   * RLS policies (stored as parse trees, not text) and their names, which
--     keep the pre-rename names on purpose: renaming them is cosmetic and
--     would add churn to a change that is already wide
--   * triggers (ai_analysis_auto_assign, customers_info_updated_at,
--     profiles_reference_code_immutable, profiles_set_employee_id,
--     profiles_set_reference_code, tickets_customer_update_guard)
--   * membership of the `supabase_realtime` publication
--   * the `ticket_number_seq` default on tickets.ticket_number, so ticket
--     numbering continues from where it left off
--
-- WHAT DOES NOT FOLLOW, AND IS THEREFORE FIXED HERE
-- -------------------------------------------------
-- plpgsql and sql function bodies are stored as text. A rename does not
-- rewrite them; they simply start failing at runtime. A scan of every function
-- in every non-system schema (with newlines normalised, because the bodies
-- contain literal \r\n and a naive line-anchored search misses them) found
-- exactly five that read one of these tables:
--
--   private_public.current_profile_org_id      -> public.profiles
--   private_public.current_profile_role        -> public.profiles
--   public.handle_new_user                     -> public.profiles
--   public.rve_set_reference_code              -> public.profiles
--   public.trg_auto_assign_on_ai_analysis      -> tickets
--
-- public.tickets_guard_customer_update is deliberately NOT in that list. It
-- matches a text search for "tickets", but only inside the English text of its
-- RAISE EXCEPTION message; it never queries the table. Redefining it would
-- risk drifting from production for no gain.
--
-- omnisciencia.handle_new_user and omnisciencia.get_my_plan also match a
-- search for "profiles" -- they read omnisciencia.profiles, a different table
-- in a different schema. They are not touched.
--
-- public.handle_new_user deserves singling out: it is fired by the
-- `on_auth_user_created` trigger on auth.users, which runs for EVERY signup on
-- this instance, from every application. If it were left pointing at
-- public.profiles after the rename, its INSERT would fail, the trigger would
-- abort, and the signup would roll back -- an instance-wide outage, not a
-- silent degradation. It shares auth.users with three other triggers
-- (omni_on_auth_user_created, rolewise_on_auth_user_created,
-- waai_on_auth_user_created), none of which touch these tables.
--
-- IDEMPOTENCY
-- -----------
-- The whole body is guarded on `public.tickets` still existing, so re-running
-- it is a no-op. CI applies its own fixtures, which already create the hd_*
-- names, and therefore skips this file entirely.
--
-- ROLLBACK: docs/sql/rollback_schema_prefix_hd.sql (exact inverse).
--
-- Wrapped in an explicit transaction because this is applied by hand in the
-- Supabase SQL editor, which does not wrap a multi-statement script for you.
-- Either all seven tables and all five functions move, or none do.

begin;

do $hd_prefix$
begin
  if to_regclass('public.tickets') is null then
    raise notice 'hd_ prefix migration: public.tickets not present, nothing to do';
    return;
  end if;

  -- 1. The seven tables. -----------------------------------------------------
  alter table public.tickets            rename to hd_tickets;
  alter table public.profiles           rename to hd_profiles;
  alter table public.notifications      rename to hd_notifications;
  alter table public.ticket_comments    rename to hd_ticket_comments;
  alter table public.ticket_audit_logs  rename to hd_ticket_audit_logs;
  alter table public.ai_analysis        rename to hd_ai_analysis;
  alter table public.customers_info     rename to hd_customers_info;
end
$hd_prefix$;

-- 2. The five functions whose bodies do not follow the rename. ---------------
-- Reproduced verbatim from production (pg_get_functiondef), with only the
-- table name changed, so that anything else about them -- volatility,
-- SECURITY DEFINER, search_path, row_security -- survives untouched.

create or replace function private_public.current_profile_org_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
  SELECT organization_id
  FROM public.hd_profiles
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
  FROM public.hd_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$function$;

-- Instance-wide blast radius. See the note above.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.hd_profiles (id, full_name, role)
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
    IF NOT EXISTS (SELECT 1 FROM public.hd_profiles WHERE reference_code = v_candidate) THEN
      NEW.reference_code := v_candidate;
      RETURN NEW;
    END IF;
    IF v_attempt >= 20 THEN
      RAISE EXCEPTION 'RVE_REFERENCE_CODE_COLLISION_EXHAUSTED: could not generate a unique reference_code after % attempts', v_attempt;
    END IF;
  END LOOP;
END;
$function$;

-- NOTE, unrelated to the rename but found while auditing it: this function
-- calls public.assign_ticket_to_agent(), which DOES NOT EXIST in this database.
-- Its trigger (ai_analysis_auto_assign) is AFTER INSERT on the analysis table,
-- so every insert for a ticket with assigned_to IS NULL already fails today
-- with undefined_function and rolls the insert back. That is a pre-existing
-- defect, not something this migration introduces, and it is left exactly as
-- it is here so the rename stays a rename. It is called out in the
-- verification checklist so it is not mistaken for fallout.
create or replace function public.trg_auto_assign_on_ai_analysis()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
BEGIN
  IF EXISTS (SELECT 1 FROM hd_tickets WHERE id = NEW.ticket_id AND assigned_to IS NULL) THEN
    PERFORM assign_ticket_to_agent(NEW.ticket_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Realtime publication. ---------------------------------------------------
-- Membership is stored by OID in pg_publication_rel, so the four member tables
-- (tickets, ticket_comments, ticket_audit_logs, notifications) stay in
-- `supabase_realtime` across the rename on their own. This block is therefore
-- a safety net rather than a fix: it re-adds any of the four that is missing,
-- and is a no-op when they are all present.
do $hd_publication$
declare
  target_table text;
begin
  foreach target_table in array array[
    'hd_tickets', 'hd_ticket_comments', 'hd_ticket_audit_logs', 'hd_notifications'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
      raise notice 'hd_ prefix migration: re-added %s to supabase_realtime', target_table;
    end if;
  end loop;
end
$hd_publication$;

-- 4. Assert the end state before committing. ---------------------------------
do $hd_assert$
declare
  missing text;
  leftover text;
  bad_fn text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['hd_tickets','hd_profiles','hd_notifications','hd_ticket_comments',
                    'hd_ticket_audit_logs','hd_ai_analysis','hd_customers_info']) t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'hd_ prefix migration: missing renamed tables: %', missing;
  end if;

  select string_agg(t, ', ') into leftover
  from unnest(array['tickets','profiles','notifications','ticket_comments',
                    'ticket_audit_logs','ai_analysis','customers_info']) t
  where to_regclass('public.' || t) is not null;
  if leftover is not null then
    raise exception 'hd_ prefix migration: old names still present: %', leftover;
  end if;

  -- No function anywhere still reads an old name. Newlines are normalised
  -- because the bodies contain literal \r\n; the omnisciencia schema is
  -- excluded because its matches are its own omnisciencia.profiles.
  select string_agg(n.nspname || '.' || p.proname, ', ') into bad_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private_public')
    and regexp_replace(p.prosrc, '[\r\n\t]+', ' ', 'g')
        ~* '\m(from|join|into|update|exists\s*\(\s*select\s+1\s+from)\s+(public\.)?(tickets|profiles|notifications|ticket_comments|ticket_audit_logs|ai_analysis|customers_info)\M';
  if bad_fn is not null then
    raise exception 'hd_ prefix migration: functions still reading old names: %', bad_fn;
  end if;

  raise notice 'hd_ prefix migration: 7 tables renamed, 5 functions rewritten, publication verified';
end
$hd_assert$;

commit;
