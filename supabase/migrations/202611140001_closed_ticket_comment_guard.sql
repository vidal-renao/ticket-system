-- Customers cannot add comments to a closed ticket.
--
-- The application already refuses this (POST /api/comments returns 409 and the
-- customer view hides the reply box), but `authenticated` holds INSERT on
-- hd_ticket_comments and the policy ticket_comments_create_authorized does not
-- look at the ticket status, so a customer calling PostgREST directly could
-- still write to a closed ticket. This trigger makes the database rule match
-- the application rule. Staff are unaffected; `resolved` stays open for the
-- customer (the reopen window depends on it).
--
-- Idempotent: create or replace + drop trigger if exists.
-- Rollback:
--   drop trigger if exists hd_ticket_comments_guard_closed on public.hd_ticket_comments;
--   drop function if exists public.hd_ticket_comments_guard_closed();

create or replace function public.hd_ticket_comments_guard_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ticket_status text;
begin
  if coalesce(current_profile_role(), '') <> 'customer' then
    return new;
  end if;

  select status into ticket_status
  from public.hd_tickets
  where id = new.ticket_id;

  if ticket_status = 'closed' then
    raise exception 'ticket is closed'
      using errcode = 'check_violation',
            hint = 'Open a new ticket instead.';
  end if;

  return new;
end;
$$;

revoke all on function public.hd_ticket_comments_guard_closed() from public;

drop trigger if exists hd_ticket_comments_guard_closed on public.hd_ticket_comments;
create trigger hd_ticket_comments_guard_closed
  before insert on public.hd_ticket_comments
  for each row
  execute function public.hd_ticket_comments_guard_closed();
