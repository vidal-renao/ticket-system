-- pgTAP suite for 202611160001_ai_quota.sql (spec REQ-F0-03).
--
-- Run against a disposable database after fixtures/phase0_base.sql and the
-- migration, in that order.
--
-- Small limits (3 / 5 / 6) are passed explicitly so the windows can be filled
-- with a handful of calls; the production defaults (30 / 200 / 1000) are
-- asserted separately from the function signature.
\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

BEGIN;
SELECT plan(36);

-- Run a statement as a browser role and report the SQLSTATE (or 'ok').
CREATE FUNCTION pg_temp.as_role(p_role text, p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $helper$
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    RESET ROLE;
    RETURN 'ok';
  EXCEPTION WHEN others THEN
    RESET ROLE;
    RETURN SQLSTATE;
  END;
END;
$helper$;

-- One quota call with the small test limits, as 'allowed/reason'.
CREATE FUNCTION pg_temp.consume(p_user uuid, p_org uuid)
RETURNS text
LANGUAGE sql
AS $helper$
  SELECT q.allowed::text || '/' || q.reason
    FROM public.hd_consume_ai_quota(p_user, p_org, 'translate', 3, 5, 6) q;
$helper$;

-- ---------------------------------------------------------------------------
-- Structure and access
-- ---------------------------------------------------------------------------
SELECT has_table('public', 'hd_ai_usage', 'hd_ai_usage exists');

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hd_ai_usage'::regclass),
  true,
  'RLS is enabled on hd_ai_usage'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hd_ai_usage'),
  0,
  'hd_ai_usage has no policies: nothing is reachable with a browser JWT'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.hd_ai_usage', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.hd_ai_usage', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.hd_ai_usage', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.hd_ai_usage', 'DELETE'),
  'authenticated holds no privilege on hd_ai_usage'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.hd_ai_usage', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.hd_ai_usage', 'INSERT'),
  'anon holds no privilege on hd_ai_usage'
);

SELECT is(
  (SELECT prosecdef FROM pg_proc
    WHERE oid = 'public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)'::regprocedure),
  true,
  'hd_consume_ai_quota is SECURITY DEFINER'
);

SELECT ok(
  (SELECT proconfig::text LIKE '%search_path=pg_catalog, public%' FROM pg_proc
    WHERE oid = 'public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)'::regprocedure),
  'hd_consume_ai_quota pins its search_path'
);

SELECT ok(
  (SELECT prosecdef AND proconfig::text LIKE '%search_path=pg_catalog, public%' FROM pg_proc
    WHERE oid = 'public.hd_purge_ai_usage()'::regprocedure),
  'hd_purge_ai_usage is SECURITY DEFINER with a pinned search_path'
);

SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.hd_purge_ai_usage()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.hd_purge_ai_usage()', 'EXECUTE'),
  'neither browser role may execute the quota functions'
);

SELECT ok(
  has_function_privilege('service_role',
    'public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)', 'EXECUTE'),
  'service_role may execute hd_consume_ai_quota'
);

SELECT is(
  (SELECT pg_get_function_arguments(
     'public.hd_consume_ai_quota(uuid, uuid, text, integer, integer, integer)'::regprocedure)),
  'p_user_id uuid, p_organization_id uuid, p_endpoint text, p_user_hourly_limit integer DEFAULT 30, p_user_daily_limit integer DEFAULT 200, p_org_daily_limit integer DEFAULT 1000',
  'the defaults are the approved limits: 30/hour and 200/day per user, 1000/day per organization'
);

SELECT is(
  pg_temp.as_role('authenticated', $$ SELECT count(*) FROM public.hd_ai_usage $$),
  '42501', 'authenticated cannot read hd_ai_usage');
SELECT is(
  pg_temp.as_role('authenticated',
    $$ INSERT INTO public.hd_ai_usage (user_id, organization_id, endpoint)
       VALUES ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0', 'translate') $$),
  '42501', 'authenticated cannot write hd_ai_usage');
SELECT is(
  pg_temp.as_role('authenticated',
    $$ SELECT * FROM public.hd_consume_ai_quota(
         '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0', 'translate') $$),
  '42501', 'authenticated cannot call hd_consume_ai_quota directly');
SELECT is(
  pg_temp.as_role('anon',
    $$ SELECT * FROM public.hd_consume_ai_quota(
         '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0', 'translate') $$),
  '42501', 'anon cannot call hd_consume_ai_quota directly');
SELECT is(
  pg_temp.as_role('service_role',
    $$ SELECT * FROM public.hd_consume_ai_quota(
         '00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b0', 'wiki_chat') $$),
  'ok', 'service_role can call hd_consume_ai_quota');
DELETE FROM public.hd_ai_usage;

-- ---------------------------------------------------------------------------
-- Membership: the pair must be a real, active membership
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000b0'),
  'false/not_member', 'a user is refused against an organization that is not theirs');
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000a0'),
  'false/not_member', 'a frozen profile is refused');
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a8', '00000000-0000-4000-8000-0000000000a0'),
  'false/not_member', 'a soft-deleted profile is refused');
SELECT is((SELECT count(*)::int FROM public.hd_ai_usage), 0,
  'a refused membership records nothing');

-- ---------------------------------------------------------------------------
-- Per-user hourly window (limit 3)
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT string_agg(pg_temp.consume('00000000-0000-4000-8000-0000000000a4',
                                     '00000000-0000-4000-8000-0000000000a0'), ',')
     FROM generate_series(1, 3)),
  'true/ok,true/ok,true/ok',
  'requests up to the hourly limit are allowed');
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0'),
  'false/user_hour', 'the request past the hourly limit is refused');
SELECT is((SELECT count(*)::int FROM public.hd_ai_usage), 3,
  'a refused request is not recorded');
SELECT ok(
  (SELECT q.retry_after_seconds BETWEEN 3590 AND 3600
     FROM public.hd_consume_ai_quota('00000000-0000-4000-8000-0000000000a4',
            '00000000-0000-4000-8000-0000000000a0', 'translate', 3, 5, 6) q),
  'retry_after_seconds is the time until the oldest request leaves the hour');
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a0'),
  'true/ok', 'another user of the same organization is not affected by that window');

-- The window slides: once the requests are older than an hour, room returns.
UPDATE public.hd_ai_usage SET created_at = created_at - interval '61 minutes'
 WHERE user_id = '00000000-0000-4000-8000-0000000000a4';
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0'),
  'true/ok', 'requests older than an hour no longer count against the hourly window');

-- ---------------------------------------------------------------------------
-- Per-user daily window (limit 5): a4 now has 3 old + 1 fresh = 4
-- ---------------------------------------------------------------------------
UPDATE public.hd_ai_usage SET created_at = created_at - interval '61 minutes'
 WHERE user_id = '00000000-0000-4000-8000-0000000000a4';
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0'),
  'true/ok', 'the fifth request of the day is allowed');
UPDATE public.hd_ai_usage SET created_at = created_at - interval '61 minutes'
 WHERE user_id = '00000000-0000-4000-8000-0000000000a4';
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a0'),
  'false/user_day', 'the sixth request of the day is refused even with the hour empty');
SELECT ok(
  (SELECT q.retry_after_seconds BETWEEN 3600 * 20 AND 3600 * 24
     FROM public.hd_consume_ai_quota('00000000-0000-4000-8000-0000000000a4',
            '00000000-0000-4000-8000-0000000000a0', 'translate', 3, 5, 6) q),
  'the daily refusal reports a retry window measured against 24 hours');

-- ---------------------------------------------------------------------------
-- Per-organization daily window (limit 6): A holds 5 (a4) + 1 (a5) = 6
-- ---------------------------------------------------------------------------
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a0'),
  'false/org_day', 'a user who has asked nothing is refused once the organization quota is spent');
SELECT is(pg_temp.consume('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b0'),
  'true/ok', 'organization B is not affected by the quota of organization A');

-- ---------------------------------------------------------------------------
-- Input validation
-- ---------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT * FROM public.hd_consume_ai_quota(NULL, '00000000-0000-4000-8000-0000000000a0', 'translate') $$,
  '22004', NULL, 'a NULL user is rejected');
SELECT throws_ok(
  $$ SELECT * FROM public.hd_consume_ai_quota('00000000-0000-4000-8000-0000000000b4',
       '00000000-0000-4000-8000-0000000000b0', 'translate', 0, 5, 6) $$,
  '22023', NULL, 'a non-positive limit is rejected');
SELECT throws_ok(
  $$ SELECT * FROM public.hd_consume_ai_quota('00000000-0000-4000-8000-0000000000b4',
       '00000000-0000-4000-8000-0000000000b0', 'not_an_endpoint') $$,
  '23514', NULL, 'an unknown endpoint is rejected by the CHECK constraint');

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
INSERT INTO public.hd_ai_usage (user_id, organization_id, endpoint, created_at) VALUES
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b0', 'translate', now() - interval '8 days'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b0', 'translate', now() - interval '6 days');
SELECT is(public.hd_purge_ai_usage(), 1::bigint, 'the purge removes rows older than 7 days');
SELECT is(
  (SELECT count(*)::int FROM public.hd_ai_usage WHERE created_at < now() - interval '5 days'),
  1,
  'and keeps rows inside the 7-day horizon');

SELECT * FROM finish();
ROLLBACK;
