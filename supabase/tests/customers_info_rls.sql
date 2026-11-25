-- pgTAP suite for 202611160002_customers_info_rls.sql (spec REQ-F0-05).
--
-- Run against a disposable database after fixtures/phase0_base.sql and the
-- migration, in that order. Two organizations (A and B) are seeded so every
-- assertion that matters is a cross-tenant one: the defect being closed was
-- invisible with a single tenant.
\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

BEGIN;
SELECT plan(38);

-- Same helper as tickets_write_policies.sql: run a statement as an actor,
-- report 'rows=N' or the SQLSTATE, and undo it either way.
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

-- Which hd_customers_info ids can this actor see? Sorted, comma-separated
-- short suffixes (the last two hex digits), so a failure names the leak.
CREATE FUNCTION pg_temp.visible(p_actor uuid)
RETURNS text
LANGUAGE plpgsql
AS $helper$
DECLARE
  seen text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  SET LOCAL ROLE authenticated;
  SELECT coalesce(string_agg(right(id::text, 2), ',' ORDER BY id), '')
    INTO seen
    FROM public.hd_customers_info;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN seen;
EXCEPTION WHEN others THEN
  RESET ROLE;
  RETURN SQLSTATE;
END;
$helper$;

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hd_customers_info'::regclass),
  true,
  'RLS is enabled on hd_customers_info'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hd_customers_info'
      AND policyname LIKE 'codex\_%'),
  0,
  'the four organization-blind codex_* policies are gone'
);

SELECT is(
  (SELECT string_agg(policyname || ':' || cmd, ',' ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hd_customers_info'),
  'hd_customers_info_delete:DELETE,hd_customers_info_insert:INSERT,hd_customers_info_select:SELECT,hd_customers_info_update:UPDATE',
  'exactly one policy per command, and nothing else'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'hd_customers_info'
      AND roles <> '{authenticated}'),
  0,
  'every policy targets authenticated only (anon gets nothing)'
);

SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.hd_is_same_org_profile(uuid)'::regprocedure),
  true,
  'hd_is_same_org_profile is SECURITY DEFINER'
);

SELECT ok(
  (SELECT proconfig::text LIKE '%search_path=pg_catalog, public%' FROM pg_proc
    WHERE oid = 'public.hd_is_same_org_profile(uuid)'::regprocedure),
  'hd_is_same_org_profile pins its search_path'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.hd_is_same_org_profile(uuid)', 'EXECUTE'),
  'anon cannot execute hd_is_same_org_profile'
);

-- ---------------------------------------------------------------------------
-- SELECT
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.visible('00000000-0000-4000-8000-0000000000a2'), 'a4,a5',
  'agent of A sees the customers of A and none of B');
SELECT is(pg_temp.visible('00000000-0000-4000-8000-0000000000a3'), 'a4,a5',
  'manager of A sees the customers of A and none of B');
SELECT is(pg_temp.visible('00000000-0000-4000-8000-0000000000a1'), 'a4,a5',
  'admin of A sees the customers of A and none of B');
SELECT is(pg_temp.visible('00000000-0000-4000-8000-0000000000b2'), 'b4',
  'agent of B sees only the customer of B');
SELECT is(pg_temp.visible('00000000-0000-4000-8000-0000000000a4'), 'a4',
  'a customer sees only their own row, not a neighbour in the same organization');
SELECT is(pg_temp.visible('00000000-0000-4000-8000-0000000000f1'), '',
  'an agent with no organization sees nothing');

-- ---------------------------------------------------------------------------
-- UPDATE
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a2',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000b4' $$),
  'rows=0', 'agent of A cannot update a customer of B');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000b4' $$),
  'rows=0', 'admin of A cannot update a customer of B');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a2',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=0', 'agent of A cannot update a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a3',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=0', 'manager of A cannot update a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=1', 'admin of A can update a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=1', 'a customer can update their own row');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$ UPDATE public.hd_customers_info SET company_name = 'x'
        WHERE id = '00000000-0000-4000-8000-0000000000a5' $$),
  'rows=0', 'a customer cannot update another customer of the same organization');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$ UPDATE public.hd_customers_info SET company_name = 'x' $$),
  'rows=1', 'an unfiltered update by a customer touches exactly their own row');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ UPDATE public.hd_customers_info SET company_name = 'x' $$),
  'rows=2', 'an unfiltered update by the admin of A stops at the tenant boundary');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$ UPDATE public.hd_customers_info SET id = '00000000-0000-4000-8000-0000000000a6'
        WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  '42501', 'a customer cannot re-key their row onto another profile (WITH CHECK)');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ UPDATE public.hd_customers_info SET id = '00000000-0000-4000-8000-0000000000b6'
        WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  '42501', 'admin of A cannot move a row onto a profile of B (WITH CHECK)');

-- ---------------------------------------------------------------------------
-- DELETE
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a2',
    $$ DELETE FROM public.hd_customers_info WHERE id = '00000000-0000-4000-8000-0000000000b4' $$),
  'rows=0', 'agent of A cannot delete a customer of B');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ DELETE FROM public.hd_customers_info WHERE id = '00000000-0000-4000-8000-0000000000b4' $$),
  'rows=0', 'admin of A cannot delete a customer of B');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a2',
    $$ DELETE FROM public.hd_customers_info WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=0', 'agent of A cannot delete a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a3',
    $$ DELETE FROM public.hd_customers_info WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=0', 'manager of A cannot delete a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$ DELETE FROM public.hd_customers_info WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=0', 'a customer cannot delete their own row');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ DELETE FROM public.hd_customers_info WHERE id = '00000000-0000-4000-8000-0000000000a4' $$),
  'rows=1', 'admin of A can delete a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ DELETE FROM public.hd_customers_info $$),
  'rows=2', 'an unfiltered delete by the admin of A stops at the tenant boundary');

-- ---------------------------------------------------------------------------
-- INSERT
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a6',
    $$ INSERT INTO public.hd_customers_info (id, company_name)
       VALUES ('00000000-0000-4000-8000-0000000000a6', 'mine') $$),
  'rows=1', 'a customer can insert their own row');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a4',
    $$ INSERT INTO public.hd_customers_info (id, company_name)
       VALUES ('00000000-0000-4000-8000-0000000000a6', 'not mine') $$),
  '42501', 'a customer cannot insert a row for somebody else');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ INSERT INTO public.hd_customers_info (id, company_name)
       VALUES ('00000000-0000-4000-8000-0000000000a6', 'by admin') $$),
  'rows=1', 'admin of A can insert a row for a customer of A');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a1',
    $$ INSERT INTO public.hd_customers_info (id, company_name)
       VALUES ('00000000-0000-4000-8000-0000000000b6', 'cross tenant') $$),
  '42501', 'admin of A cannot insert a row for a customer of B');
SELECT is(
  pg_temp.attempt('00000000-0000-4000-8000-0000000000a2',
    $$ INSERT INTO public.hd_customers_info (id, company_name)
       VALUES ('00000000-0000-4000-8000-0000000000a6', 'by agent') $$),
  '42501', 'agent of A cannot insert a row for a customer of A');

-- ---------------------------------------------------------------------------
-- The application path is untouched: service_role bypasses RLS.
-- ---------------------------------------------------------------------------
SELECT is(
  pg_temp.attempt(NULL,
    $$ UPDATE public.hd_customers_info SET company_name = 'svc' $$),
  'rows=3', 'service_role still writes every row (application path unchanged)');

SELECT is(
  (SELECT count(*)::int FROM public.hd_customers_info),
  3,
  'no assertion above left a mutation behind'
);

SELECT * FROM finish();
ROLLBACK;
