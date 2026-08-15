-- ============================================================================
-- Fix: tickets_customer_update_guard applied the customer rule to everyone
--
-- Regression introduced by 202608040001. The guard opened with
--
--   if current_profile_role() <> 'customer' then return new; end if;
--
-- and current_profile_role() is `SELECT role FROM hd_profiles WHERE id =
-- auth.uid()`. Every application write runs through service_role, which
-- carries no end-user JWT: auth.uid() is NULL, the SELECT matches no row and
-- the function returns NULL. `NULL <> 'customer'` is NULL, not TRUE, so the
-- early return never fired and the restricted branch ran for every caller —
-- blocking admins, agents and the service routes alike. Anything writing a
-- guarded column failed, including applySlaAssessment (runs on every comment,
-- writes sla_breached) and closing a ticket.
--
-- Two changes: bail out explicitly when there is no end-user identity, and
-- compare with IS DISTINCT FROM so a NULL role can never fall into the
-- restricted branch. The guard now restricts only a positively identified
-- customer, which is what 202608040001 intended.
--
-- Rollback (forward-only per ADR-006): re-apply the function body from
-- 202608040001 — not advised, that version is the bug.
-- ============================================================================

create or replace function public.tickets_guard_customer_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  -- No end-user JWT on this connection: service_role from the API routes,
  -- pg_cron, or a SQL console. Authorization there belongs to the calling
  -- route, which has already checked role and organization. (Under the
  -- service key auth.role() is 'service_role' and auth.uid() is NULL.)
  if auth.uid() is null then
    return new;
  end if;

  actor_role := current_profile_role();

  -- IS DISTINCT FROM, not <>: a NULL role must read as "not a customer" and
  -- fall through, never drop into the restricted branch.
  if actor_role is distinct from 'customer' then
    return new;
  end if;

  if (new.status, new.assigned_to, new.assigned_team_id, new.assigned_at,
      new.assigned_by, new.review_status, new.category_id, new.category,
      new.organization_id, new.created_by, new.deleted_at, new.archived_at,
      new.sla_breached, new.resolved_at, new.closed_at)
     is distinct from
     (old.status, old.assigned_to, old.assigned_team_id, old.assigned_at,
      old.assigned_by, old.review_status, old.category_id, old.category,
      old.organization_id, old.created_by, old.deleted_at, old.archived_at,
      old.sla_breached, old.resolved_at, old.closed_at)
  then
    raise exception 'customers may only update priority and metadata on their own tickets'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
