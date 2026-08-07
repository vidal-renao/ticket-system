-- ============================================================================
-- Authenticated write path for tickets (and the inert comment INSERT policy)
--
-- Context: public.tickets has RLS enabled with INSERT and SELECT policies only.
-- There is no UPDATE and no DELETE policy, AND the `authenticated` role has no
-- UPDATE privilege on the table at all (verified via
-- information_schema.role_table_grants) — so both layers deny the authenticated
-- write path. The application is not currently broken by this: every ticket
-- mutation runs server-side through `createServiceClientStatic()` (service_role,
-- which bypasses RLS) after the route has authenticated the user and checked
-- role + organization. This migration closes the gap as defence in depth, so
-- the database — not only the API layer — enforces the rule.
--
-- Section 4 (customer column guard) and section 5 (anon revokes) are proposals;
-- they are separable and can be dropped from this file before applying.
--
-- Rollback (forward-only per ADR-006 — only if reverting this exact migration):
--   DROP TRIGGER IF EXISTS tickets_customer_update_guard ON public.tickets;
--   DROP FUNCTION IF EXISTS public.tickets_guard_customer_update();
--   DROP POLICY IF EXISTS tickets_update_enterprise_scope ON public.tickets;
--   REVOKE UPDATE ON public.tickets FROM authenticated;
--   REVOKE INSERT ON public.ticket_comments FROM authenticated;
--   -- section 5 revokes are not restored: anon never needed those privileges.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. UPDATE policy — same role scoping as tickets_read_enterprise_scope
-- ---------------------------------------------------------------------------
-- USING keeps `deleted_at IS NULL`, so soft-deleted rows cannot be resurrected
-- or edited. WITH CHECK deliberately omits it, so setting `deleted_at` (the
-- project's soft delete) is a permitted transition.
drop policy if exists tickets_update_enterprise_scope on public.tickets;

create policy tickets_update_enterprise_scope
  on public.tickets
  for update
  to authenticated
  using (
    deleted_at is null
    and organization_id = current_profile_org_id()
    and (
      (current_profile_role() = 'customer' and created_by = auth.uid())
      or (current_profile_role() = 'agent' and assigned_to = auth.uid())
      or current_profile_role() = any (array['manager', 'admin'])
    )
  )
  with check (
    organization_id = current_profile_org_id()
    and (
      (current_profile_role() = 'customer' and created_by = auth.uid())
      or (current_profile_role() = 'agent' and assigned_to = auth.uid())
      or current_profile_role() = any (array['manager', 'admin'])
    )
  );

-- ---------------------------------------------------------------------------
-- 2. No DELETE policy — deletion in this project is an UPDATE of deleted_at
-- ---------------------------------------------------------------------------
-- Hard DELETE would silently destroy the SLA history and orphan
-- ticket_audit_logs / ai_analysis rows. Soft delete is already covered by the
-- UPDATE policy above, so no DELETE policy is created and the privilege stays
-- revoked (see section 5).

-- ---------------------------------------------------------------------------
-- 3. Table privileges — policies are inert without them
-- ---------------------------------------------------------------------------
-- `authenticated` had SELECT + INSERT on tickets but no UPDATE, and only SELECT
-- on ticket_comments — which is why ticket_comments_create_authorized (a
-- correct, already-existing INSERT policy) has never actually been reachable.
grant update on public.tickets to authenticated;
grant insert on public.ticket_comments to authenticated;

-- ---------------------------------------------------------------------------
-- 4. PROPOSAL — customer column guard
-- ---------------------------------------------------------------------------
-- A row-level policy cannot express "a customer may edit only some columns".
-- Without this trigger, granting UPDATE lets a customer call PostgREST directly
-- and set status='closed' or assigned_to on their own ticket — more than the
-- application allows them (app/actions/ticket-actions.ts restricts customers to
-- priority and metadata.customer_rating). This keeps the database rule aligned
-- with the application rule.
create or replace function public.tickets_guard_customer_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_profile_role() <> 'customer' then
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

drop trigger if exists tickets_customer_update_guard on public.tickets;
create trigger tickets_customer_update_guard
  before update on public.tickets
  for each row
  execute function public.tickets_guard_customer_update();

-- ---------------------------------------------------------------------------
-- 5. PROPOSAL — remove write privileges from `anon`
-- ---------------------------------------------------------------------------
-- `anon` (the key shipped to every browser) currently holds INSERT, UPDATE,
-- DELETE and TRUNCATE on both tables. RLS neutralises the first three today,
-- and PostgREST never issues TRUNCATE, but none of these are needed: no
-- unauthenticated flow writes tickets or comments.
revoke insert, update, delete, truncate on public.tickets from anon;
revoke insert, update, delete, truncate on public.ticket_comments from anon;
revoke truncate, delete on public.tickets from authenticated;
revoke truncate on public.ticket_comments from authenticated;
