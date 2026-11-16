-- AI usage quota: a ceiling on what one user and one organization can spend.
--
-- /api/translate, /api/ai/wiki-chat and the translateText action called the
-- AI provider for any signed-in account, as often as it asked. On an instance
-- shared with other applications that is a billing exposure with no brake
-- (audit 2026-11-16, SEC-01 / SCL-04; spec REQ-F0-03; DECISIONS.md ADR-017).
--
-- WHAT THIS ADDS
-- --------------
--   public.hd_ai_usage              one row per accepted AI request
--   public.hd_consume_ai_quota()    counts and records in one step
--   public.hd_purge_ai_usage()      drops rows older than 7 days
--
-- Count and insert happen inside one function, serialized per organization
-- with a transaction-scoped advisory lock, so two parallel requests cannot
-- both read "29 of 30" and both proceed.
--
-- ACCESS
-- ------
-- RLS is enabled with NO policies and every privilege is revoked from anon and
-- authenticated: a browser JWT can neither read usage nor call the function.
-- Only service_role executes it, from lib/ai/quota.ts, with a user and
-- organization derived server-side. The function re-checks that the user
-- really belongs to that organization and is active, so a wrong pair is
-- refused instead of being billed to another tenant.
--
-- Not FORCE ROW LEVEL SECURITY on purpose: the function runs as the table
-- owner, and forcing RLS on a table without policies would lock the function
-- out of its own table.
--
-- IDEMPOTENCY: every statement is IF NOT EXISTS / CREATE OR REPLACE; grants
-- and revokes are repeatable.
--
-- DEPLOY ORDER: apply this BEFORE deploying the application code that calls
-- it. lib/ai/quota.ts fails closed -- without the function the AI endpoints
-- answer 503.
--
-- ROLLBACK (after reverting the application code that calls the function):
--   begin;
--   drop function if exists public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer);
--   drop function if exists public.hd_purge_ai_usage();
--   drop table if exists public.hd_ai_usage;
--   commit;
-- The table holds only counters younger than 7 days; dropping it loses no
-- business data.

begin;

create table if not exists public.hd_ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.hd_profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  endpoint text not null,
  created_at timestamptz not null default now(),
  constraint hd_ai_usage_endpoint_check
    check (endpoint in ('translate', 'translate_action', 'wiki_chat'))
);

comment on table public.hd_ai_usage is
  'One row per accepted interactive AI request (translate, wiki chat). Written and read only by hd_consume_ai_quota; rows older than 7 days are purged. Holds no request content.';

create index if not exists idx_hd_ai_usage_user_created
  on public.hd_ai_usage (user_id, created_at);
create index if not exists idx_hd_ai_usage_org_created
  on public.hd_ai_usage (organization_id, created_at);
create index if not exists idx_hd_ai_usage_created
  on public.hd_ai_usage (created_at);

alter table public.hd_ai_usage enable row level security;

revoke all on table public.hd_ai_usage from public, anon, authenticated;
grant select, insert, delete on table public.hd_ai_usage to service_role;

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
create or replace function public.hd_purge_ai_usage()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deleted bigint;
begin
  delete from public.hd_ai_usage u
   where u.created_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.hd_purge_ai_usage() from public, anon, authenticated;
grant execute on function public.hd_purge_ai_usage() to service_role;

-- ---------------------------------------------------------------------------
-- Count and record
-- ---------------------------------------------------------------------------
-- reason is one of:
--   ok          recorded; allowed = true
--   user_hour   the user's hourly window is full
--   user_day    the user's 24-hour window is full
--   org_day     the organization's 24-hour window is full
--   not_member  the user is not an active member of that organization
--
-- retry_after_seconds is how long until the oldest request in the full window
-- leaves it (at least 1 for a refusal by a window, 0 otherwise).
create or replace function public.hd_consume_ai_quota(
  p_user_id uuid,
  p_organization_id uuid,
  p_endpoint text,
  p_user_hourly_limit integer default 30,
  p_user_daily_limit integer default 200,
  p_org_daily_limit integer default 1000
)
returns table (allowed boolean, retry_after_seconds integer, reason text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_count bigint;
  v_oldest timestamptz;
begin
  if p_user_id is null or p_organization_id is null or p_endpoint is null then
    raise exception 'hd_consume_ai_quota: user, organization and endpoint are required'
      using errcode = '22004';
  end if;
  if p_user_hourly_limit < 1 or p_user_daily_limit < 1 or p_org_daily_limit < 1 then
    raise exception 'hd_consume_ai_quota: limits must be positive'
      using errcode = '22023';
  end if;

  -- The caller is trusted (service_role only) but not believed: the pair must
  -- be a real, active membership.
  if not exists (
    select 1
      from public.hd_profiles p
     where p.id = p_user_id
       and p.organization_id = p_organization_id
       and p.deleted_at is null
       and p.is_active is distinct from false
  ) then
    return query select false, 0, 'not_member'::text;
    return;
  end if;

  -- One counter at a time per organization. Released at commit/rollback.
  perform pg_advisory_xact_lock(hashtextextended('hd_ai_usage:' || p_organization_id::text, 0));

  select count(*), min(u.created_at)
    into v_count, v_oldest
    from public.hd_ai_usage u
   where u.user_id = p_user_id
     and u.created_at > v_now - interval '1 hour';
  if v_count >= p_user_hourly_limit then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + interval '1 hour' - v_now)))::integer),
      'user_hour'::text;
    return;
  end if;

  select count(*), min(u.created_at)
    into v_count, v_oldest
    from public.hd_ai_usage u
   where u.user_id = p_user_id
     and u.created_at > v_now - interval '24 hours';
  if v_count >= p_user_daily_limit then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + interval '24 hours' - v_now)))::integer),
      'user_day'::text;
    return;
  end if;

  select count(*), min(u.created_at)
    into v_count, v_oldest
    from public.hd_ai_usage u
   where u.organization_id = p_organization_id
     and u.created_at > v_now - interval '24 hours';
  if v_count >= p_org_daily_limit then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_oldest + interval '24 hours' - v_now)))::integer),
      'org_day'::text;
    return;
  end if;

  insert into public.hd_ai_usage (user_id, organization_id, endpoint, created_at)
  values (p_user_id, p_organization_id, p_endpoint, v_now);

  -- Retention without a scheduler: roughly one accepted request in a hundred
  -- sweeps out rows past the 7-day horizon. hd_purge_ai_usage() can also be
  -- called directly by an operator or a future cron.
  if random() < 0.01 then
    perform public.hd_purge_ai_usage();
  end if;

  return query select true, 0, 'ok'::text;
end;
$function$;

comment on function public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer) is
  'Atomically checks the per-user (hour, 24h) and per-organization (24h) AI request windows and records the request when allowed. service_role only; user and organization must be derived server-side.';

revoke all on function public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)
  to service_role;

commit;
