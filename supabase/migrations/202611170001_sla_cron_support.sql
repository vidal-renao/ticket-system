-- SLA sweep support: resume cursor and once-only breach notifications.
--
-- Spec REQ-F1-02 (audit 2026-11-16, SCL-01 / DOM-01). Two additions the
-- five-minute sweep in app/api/cron/sla/route.ts relies on:
--
-- 1. public.hd_cron_state
--    One row per background job holding where the previous run stopped. The
--    sweep reads active tickets in keyset pages and yields before the
--    function's time limit; without a stored cursor every run would start at
--    the first ticket again and the tail of a large backlog would never be
--    reached. A finished pass stores NULL.
--      job         text primary key   -- 'sla'
--      cursor      text               -- last hd_tickets.id handled, or NULL
--      updated_at  timestamptz
--    Authorization: service_role only. RLS is enabled with no policy and every
--    privilege is revoked from anon and authenticated (Supabase's default
--    privileges would otherwise hand the table to both). It holds no tenant
--    data: a ticket id is an opaque position, not a row anyone can read.
--
-- 2. hd_notifications_sla_breach_once
--    Partial unique index on hd_notifications (user_id, ticket_id, type) for
--    the two SLA breach types. lib/sla.ts already skips anyone who holds the
--    notice; the index is what makes "once" hold when two runs overlap (the
--    pg_cron job and the daily Vercel cron can). The application reads the
--    resulting 23505 as "already notified".
--    If the table already contains duplicate breach notices the index cannot
--    be built: the migration says so with a NOTICE and continues without it,
--    leaving the application-level check as the only guard. It never deletes a
--    notification.
--    Consequence, unchanged from before: a ticket that breaches its resolution
--    SLA, is reopened and breaches again does not notify the same person a
--    second time.
--
-- THE APPLICATION IS NOT AFFECTED BY THE ORDER OF DEPLOYMENT: the route treats
-- a missing hd_cron_state as "start from the beginning".
--
-- IDEMPOTENCY: CREATE TABLE / INDEX IF NOT EXISTS; REVOKE and GRANT are
-- repeatable.
--
-- ROLLBACK:
--   begin;
--   drop index if exists public.hd_notifications_sla_breach_once;
--   drop table if exists public.hd_cron_state;
--   commit;

begin;

create table if not exists public.hd_cron_state (
  job text primary key,
  cursor text,
  updated_at timestamptz not null default now()
);

comment on table public.hd_cron_state is
  'Resume point of background jobs (SLA sweep). service_role only; holds no tenant data.';

alter table public.hd_cron_state enable row level security;

revoke all on public.hd_cron_state from public, anon, authenticated;
grant select, insert, update, delete on public.hd_cron_state to service_role;

do $index$
declare
  v_duplicates bigint;
begin
  if to_regclass('public.hd_notifications_sla_breach_once') is not null then
    return;
  end if;

  select count(*) into v_duplicates
    from (
      select 1
        from public.hd_notifications
       where type in ('sla.response_breached', 'sla.resolution_breached')
       group by user_id, ticket_id, type
      having count(*) > 1
    ) d;

  if v_duplicates > 0 then
    raise notice 'sla cron support: % duplicate SLA breach notification group(s) exist; unique index hd_notifications_sla_breach_once NOT created. Remove the duplicates and re-run this migration.', v_duplicates;
    return;
  end if;

  create unique index hd_notifications_sla_breach_once
    on public.hd_notifications (user_id, ticket_id, type)
    where type in ('sla.response_breached', 'sla.resolution_breached');
end
$index$;

commit;
