-- pgTAP suite for the tickets write path:
--   202608040001_tickets_write_policies.sql   (UPDATE policy, grants, guard)
--   202608040002_fix_customer_update_guard.sql (guard actor resolution)
--
-- Run against the ephemeral CI database after tickets_write_base.sql plus both
-- migrations, in that order.
--
-- The behavioural assertions exist because 202608040001 shipped a regression
-- that a JWT-only simulation could not catch: the guard opened with
-- `current_profile_role() <> 'customer'`, which is NULL — not TRUE — on the
-- service_role connection every application write actually uses, so the
-- restricted branch ran for admins too. Both paths are now asserted: the
-- service_role path must NOT trip the guard, the customer path MUST.
\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

BEGIN;
SELECT plan(18);

-- ---------------------------------------------------------------------------
-- Helper: run a statement as a given actor and report what happened.
--
-- Returns 'rows=N' on success (so an RLS-silenced no-op update cannot pass as
-- a success) or the SQLSTATE on failure. The role is reset on both paths, so a
-- role switch never leaks into pgTAP's own temp tables.
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.attempt(p_actor uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $helper$
DECLARE
  affected bigint;
BEGIN
  BEGIN
    IF p_actor IS NULL THEN
      -- service_role: no end-user JWT at all, exactly like the API routes.
      PERFORM set_config('request.jwt.claim.sub', '', true);
      SET LOCAL ROLE service_role;
    ELSE
      PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
      SET LOCAL ROLE authenticated;
    END IF;

    EXECUTE p_sql;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RESET ROLE;
    RETURN 'rows=' || affected;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    RETURN SQLSTATE;
  END;
END;
$helper$;

-- ---------------------------------------------------------------------------
-- Structure: the UPDATE policy, the deliberate absence of a DELETE policy,
-- the grants that make the policies reachable, and the guard trigger.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tickets'
      AND policyname = 'tickets_update_enterprise_scope' AND cmd = 'UPDATE'),
  1,
  'tickets has an UPDATE policy'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tickets' AND cmd = 'DELETE'),
  0,
  'tickets has no DELETE policy: deletion is an UPDATE of deleted_at'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.tickets', 'UPDATE'),
  'authenticated may UPDATE tickets, so the UPDATE policy is reachable'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.ticket_comments', 'INSERT'),
  'authenticated may INSERT ticket_comments, so its INSERT policy is reachable'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.tickets', 'UPDATE'),
  'anon may not UPDATE tickets'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.tickets', 'INSERT'),
  'anon may not INSERT tickets'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.ticket_comments', 'INSERT'),
  'anon may not INSERT ticket_comments'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.tickets', 'DELETE'),
  'authenticated may not hard-delete tickets'
);

SELECT is(
  (SELECT count(*)::int FROM pg_trigger
    WHERE tgrelid = 'public.tickets'::regclass
      AND tgname = 'tickets_customer_update_guard' AND NOT tgisinternal),
  1,
  'the customer column guard is attached to tickets'
);

-- ---------------------------------------------------------------------------
-- The NULL trap itself: with no end-user JWT the role helper returns NULL, and
-- `NULL <> 'customer'` is NULL rather than TRUE. Asserting the premise keeps
-- the two behavioural tests below honest.
-- ---------------------------------------------------------------------------
SELECT is(
  public.current_profile_role(), NULL,
  'current_profile_role() is NULL when there is no end-user JWT'
);

SELECT is(
  (NULL::text <> 'customer'), NULL,
  'the original <> test yields NULL, not TRUE, which is what let the guard misfire'
);

SELECT ok(
  (NULL::text IS DISTINCT FROM 'customer'),
  'IS DISTINCT FROM yields TRUE for a NULL role, so the guard falls through'
);

-- ---------------------------------------------------------------------------
-- (a) service_role path — every application write. The guard must not fire.
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt(NULL, $$ UPDATE public.tickets
                              SET sla_breached = NOT sla_breached
                            WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  'rows=1',
  'service_role writing sla_breached succeeds (applySlaAssessment, runs on every comment)'
);

SELECT is(
  pg_temp.attempt(NULL, $$ UPDATE public.tickets
                              SET status = 'closed', closed_at = now()
                            WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  'rows=1',
  'service_role closing a ticket succeeds (admin close through the API)'
);

SELECT is(
  pg_temp.attempt(NULL, $$ UPDATE public.tickets
                              SET status = 'closed'
                            WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  'rows=1',
  'service_role may perform the customer sign-off transition (POST /api/tickets/[id]/confirm)'
);

-- ---------------------------------------------------------------------------
-- (b) authenticated path with a customer JWT — the guard must fire.
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000cc',
                  $$ UPDATE public.tickets
                        SET status = 'closed', closed_at = now()
                      WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  '42501',
  'a customer may not change the status of their own ticket from the browser'
);

SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000cc',
                  $$ UPDATE public.tickets
                        SET assigned_to = '00000000-0000-4000-8000-0000000000ad'
                      WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  '42501',
  'a customer may not reassign their own ticket from the browser'
);

SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000cc',
                  $$ UPDATE public.tickets
                        SET priority = 'high'
                      WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  'rows=1',
  'a customer may still raise the priority of their own ticket (markUrgent)'
);

-- ---------------------------------------------------------------------------
-- The same write as a positively identified admin must pass on both paths.
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000ad',
                  $$ UPDATE public.tickets
                        SET status = 'closed', closed_at = now()
                      WHERE id = '00000000-0000-4000-8000-000000007c01' $$),
  'rows=1',
  'an admin with their own JWT may close a ticket'
);

SELECT * FROM finish();
ROLLBACK;
