-- pgTAP suite for the Phase 1 integrity migrations (spec REQ-F1-02/04/05/06):
--   202611170001_sla_cron_support.sql
--   202611170003_tickets_write_lockdown.sql
--   202611170004_admin_audit_logs.sql
--
-- Run against a disposable database after fixtures/phase1_base.sql and the
-- three migrations, in that order. Organizations A and B come from
-- phase0_base.sql; every isolation assertion is cross-tenant.
\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

BEGIN;
SELECT plan(36);

-- Run a statement as an actor (NULL = service_role), report 'rows=N' or the
-- SQLSTATE, and undo it either way. Same helper as the Phase 0 suites.
CREATE FUNCTION pg_temp.attempt(p_actor uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $helper$
DECLARE
  affected bigint;
BEGIN
  BEGIN
    IF p_actor IS NULL THEN
      PERFORM set_config('request.jwt.claim.sub', '', true);
      SET LOCAL ROLE service_role;
    ELSE
      PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
      SET LOCAL ROLE authenticated;
    END IF;

    EXECUTE p_sql;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = '40000', MESSAGE = 'ci-undo:' || affected;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    IF SQLSTATE = '40000' AND SQLERRM LIKE 'ci-undo:%' THEN
      RETURN 'rows=' || split_part(SQLERRM, ':', 2);
    END IF;
    RETURN SQLSTATE;
  END;
END;
$helper$;

-- Same as attempt(), but as anon.
CREATE FUNCTION pg_temp.attempt_anon(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $helper$
DECLARE
  affected bigint;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    SET LOCAL ROLE anon;
    EXECUTE p_sql;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RESET ROLE;
    RAISE EXCEPTION USING ERRCODE = '40000', MESSAGE = 'ci-undo:' || affected;
  EXCEPTION WHEN others THEN
    RESET ROLE;
    IF SQLSTATE = '40000' AND SQLERRM LIKE 'ci-undo:%' THEN
      RETURN 'rows=' || split_part(SQLERRM, ':', 2);
    END IF;
    RETURN SQLSTATE;
  END;
END;
$helper$;

-- Run a SELECT returning one integer as an actor.
CREATE FUNCTION pg_temp.count_as(p_actor uuid, p_sql text)
RETURNS bigint
LANGUAGE plpgsql
AS $helper$
DECLARE
  n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN n;
END;
$helper$;

-- ===========================================================================
-- 1. hd_tickets: no direct writes from API roles (REQ-F1-04)
-- ===========================================================================
SELECT is(has_table_privilege('authenticated', 'public.hd_tickets', 'INSERT'), false, 'authenticated has no INSERT on hd_tickets');
SELECT is(has_table_privilege('authenticated', 'public.hd_tickets', 'UPDATE'), false, 'authenticated has no UPDATE on hd_tickets');
SELECT is(has_table_privilege('authenticated', 'public.hd_tickets', 'DELETE'), false, 'authenticated has no DELETE on hd_tickets');
SELECT is(has_table_privilege('anon', 'public.hd_tickets', 'INSERT'), false, 'anon has no INSERT on hd_tickets');
SELECT is(has_table_privilege('authenticated', 'public.hd_tickets', 'SELECT'), true, 'authenticated keeps SELECT on hd_tickets');

SELECT is(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hd_tickets' AND cmd IN ('INSERT', 'UPDATE', 'DELETE')),
  0::bigint,
  'no INSERT/UPDATE/DELETE policies remain on hd_tickets'
);
SELECT is(
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hd_tickets' AND policyname = 'tickets_read_enterprise_scope'),
  1::bigint,
  'the SELECT policy on hd_tickets is untouched'
);

-- Customer of A inserting their own ticket with their own JWT: denied.
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$INSERT INTO public.hd_tickets (organization_id, created_by, title, priority, status)
      VALUES ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a4', 'x', 'critical', 'closed')$$),
  '42501',
  'customer cannot insert a ticket through PostgREST'
);
-- Assigned agent of A resolving their ticket directly: denied.
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a2',
    $$UPDATE public.hd_tickets SET status = 'resolved', sla_breached = false
       WHERE id = '00000000-0000-4000-8000-00000000a701'$$),
  '42501',
  'assigned agent cannot change a ticket through PostgREST'
);
-- Admin of A deleting directly: denied.
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$DELETE FROM public.hd_tickets WHERE id = '00000000-0000-4000-8000-00000000a701'$$),
  '42501',
  'admin cannot delete a ticket through PostgREST'
);
SELECT is(
  pg_temp.attempt_anon($$UPDATE public.hd_tickets SET status = 'closed'$$),
  '42501',
  'anon cannot update tickets'
);
-- The application path (service_role) still writes.
SELECT is(
  pg_temp.attempt(NULL,
    $$INSERT INTO public.hd_tickets (organization_id, created_by, title)
      VALUES ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a4', 'via service role')$$),
  'rows=1',
  'service_role can still insert tickets'
);
SELECT is(
  pg_temp.attempt(NULL,
    $$UPDATE public.hd_tickets SET status = 'in_progress' WHERE id = '00000000-0000-4000-8000-00000000a701'$$),
  'rows=1',
  'service_role can still update tickets'
);
-- Reads unchanged: agent of A sees their assigned ticket, not B's.
SELECT is(
  pg_temp.count_as('00000000-0000-4000-8000-0000000000a2', $$SELECT count(*) FROM public.hd_tickets$$),
  1::bigint,
  'agent of A still reads only the ticket assigned to them'
);

-- ===========================================================================
-- 2. hd_ticket_audit_logs: append-only for every role (REQ-F1-05)
-- ===========================================================================
SELECT is(
  pg_temp.attempt(NULL, $$UPDATE public.hd_ticket_audit_logs SET action = 'x' WHERE id = '00000000-0000-4000-8000-00000000a901'$$),
  '42501',
  'service_role cannot update an audit row (privilege revoked; the trigger is the second layer)'
);
SELECT is(
  pg_temp.attempt(NULL, $$DELETE FROM public.hd_ticket_audit_logs WHERE id = '00000000-0000-4000-8000-00000000a901'$$),
  '42501',
  'service_role cannot delete an audit row'
);
SELECT throws_ok(
  $$TRUNCATE public.hd_ticket_audit_logs$$,
  'HD001',
  NULL,
  'even the table owner cannot truncate the audit trail'
);
SELECT throws_ok(
  $$DELETE FROM public.hd_ticket_audit_logs$$,
  'HD001',
  NULL,
  'even the table owner cannot delete audit rows'
);
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1', $$UPDATE public.hd_ticket_audit_logs SET action = 'x'$$),
  '42501',
  'admin JWT cannot update audit rows (privilege revoked)'
);
SELECT is(
  pg_temp.attempt_anon($$DELETE FROM public.hd_ticket_audit_logs$$),
  '42501',
  'anon cannot delete audit rows'
);
SELECT is(
  pg_temp.attempt(NULL,
    $$INSERT INTO public.hd_ticket_audit_logs (organization_id, actor_role, action, resource_type, resource_id)
      VALUES ('00000000-0000-4000-8000-0000000000a0', 'system', 'ci.check', 'ticket', '00000000-0000-4000-8000-00000000a701')$$),
  'rows=1',
  'service_role can still append audit rows'
);

-- ===========================================================================
-- 3. hd_admin_audit_logs (REQ-F1-06)
-- ===========================================================================
SELECT has_table('public', 'hd_admin_audit_logs', 'hd_admin_audit_logs exists');
SELECT columns_are('public', 'hd_admin_audit_logs',
  ARRAY['id', 'organization_id', 'actor_id', 'actor_type', 'action', 'target_type', 'target_id', 'outcome', 'details', 'created_at'],
  'hd_admin_audit_logs has exactly the contract columns shared with the MCP server');

-- Seed one event per organization through the application path.
SET LOCAL ROLE service_role;
INSERT INTO public.hd_admin_audit_logs (organization_id, actor_id, actor_type, action, target_type, target_id)
VALUES
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1', 'user', 'user.role_changed', 'profile', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b0', NULL, 'mcp', 'ticket.status_changed', 'ticket', '00000000-0000-4000-8000-00000000b701');
RESET ROLE;

SELECT is(
  pg_temp.count_as('00000000-0000-4000-8000-0000000000a1', $$SELECT count(*) FROM public.hd_admin_audit_logs$$),
  1::bigint,
  'admin of A reads only the events of organization A'
);
SELECT is(
  pg_temp.count_as('00000000-0000-4000-8000-0000000000a2', $$SELECT count(*) FROM public.hd_admin_audit_logs$$),
  0::bigint,
  'agent of A reads no administrative events'
);
SELECT is(
  pg_temp.count_as('00000000-0000-4000-8000-0000000000a3', $$SELECT count(*) FROM public.hd_admin_audit_logs$$),
  0::bigint,
  'manager of A reads no administrative events'
);
SELECT is(
  pg_temp.count_as('00000000-0000-4000-8000-0000000000a4', $$SELECT count(*) FROM public.hd_admin_audit_logs$$),
  0::bigint,
  'customer of A reads no administrative events'
);
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$INSERT INTO public.hd_admin_audit_logs (organization_id, actor_type, action)
      VALUES ('00000000-0000-4000-8000-0000000000a0', 'user', 'forged')$$),
  '42501',
  'admin JWT cannot write administrative events'
);
SELECT is(
  pg_temp.attempt(NULL, $$UPDATE public.hd_admin_audit_logs SET action = 'x'$$),
  '42501',
  'service_role cannot update administrative events'
);
SELECT is(
  pg_temp.attempt(NULL, $$DELETE FROM public.hd_admin_audit_logs$$),
  '42501',
  'service_role cannot delete administrative events'
);
SELECT throws_ok(
  $$UPDATE public.hd_admin_audit_logs SET action = 'x'$$,
  'HD001',
  NULL,
  'even the table owner cannot update administrative events'
);
SELECT throws_ok(
  $$INSERT INTO public.hd_admin_audit_logs (organization_id, actor_type, action) VALUES ('00000000-0000-4000-8000-0000000000a0', 'robot', 'x')$$,
  '23514',
  NULL,
  'actor_type outside user/system/mcp is rejected'
);

-- ===========================================================================
-- 4. SLA sweep support (REQ-F1-02)
-- ===========================================================================
SELECT is(has_table_privilege('authenticated', 'public.hd_cron_state', 'SELECT'), false, 'authenticated cannot read hd_cron_state');
SELECT is(has_table_privilege('anon', 'public.hd_cron_state', 'SELECT'), false, 'anon cannot read hd_cron_state');
SELECT is(has_table_privilege('service_role', 'public.hd_cron_state', 'UPDATE'), true, 'service_role can update hd_cron_state');

SET LOCAL ROLE service_role;
INSERT INTO public.hd_notifications (user_id, ticket_id, type, title)
VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a701', 'sla.response_breached', 'SLA response breached');
RESET ROLE;
SELECT throws_ok(
  $$INSERT INTO public.hd_notifications (user_id, ticket_id, type, title)
    VALUES ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000a701', 'sla.response_breached', 'again')$$,
  '23505',
  NULL,
  'a second identical SLA breach notice is rejected by the unique index'
);

SELECT * FROM finish();
ROLLBACK;
