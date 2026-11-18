-- pgTAP suite for 202611170002_sla_pg_cron.sql (spec REQ-F1-02, D5-A).
--
-- Uses fixtures/pg_cron_stub.sql (test doubles for pg_cron, pg_net and
-- Vault). Applies the migration itself, so run it after the fixtures only:
--   phase1_base.sql, pg_cron_stub.sql, then this file with the migration path
--   in the psql variable :migration, e.g.
--   psql -v migration=supabase/migrations/202611170002_sla_pg_cron.sql -f supabase/tests/sla_pg_cron.sql
\set ON_ERROR_STOP on
SET search_path = pg_catalog, public, extensions;

BEGIN;
SELECT plan(8);

-- 1. Without the Vault secret nothing is scheduled.
\ir :migration
SELECT is((SELECT count(*) FROM cron.job WHERE jobname = 'hd-sla-every-5-min'), 0::bigint,
  'no job is scheduled while the Vault secret is missing');

-- 2. With the secret, exactly one job every five minutes.
SELECT vault.create_secret('ci-secret-value-that-is-at-least-32-characters', 'hd_cron_secret');
\ir :migration
SELECT is((SELECT count(*) FROM cron.job WHERE jobname = 'hd-sla-every-5-min'), 1::bigint,
  'one job is scheduled once the secret exists');
SELECT is((SELECT schedule FROM cron.job WHERE jobname = 'hd-sla-every-5-min'), '*/5 * * * *',
  'the job runs every five minutes');

-- 3. Re-applying keeps a single job.
\ir :migration
SELECT is((SELECT count(*) FROM cron.job WHERE jobname = 'hd-sla-every-5-min'), 1::bigint,
  're-applying the migration keeps exactly one job');

-- 4. The secret never lands in the job text.
SELECT is(
  (SELECT position('ci-secret-value' IN command) FROM cron.job WHERE jobname = 'hd-sla-every-5-min'),
  0,
  'the secret value is not stored in cron.job'
);
SELECT ok(
  (SELECT command LIKE '%vault.decrypted_secrets%' FROM cron.job WHERE jobname = 'hd-sla-every-5-min'),
  'the job reads the secret from Vault at run time'
);

-- 5. Running the job command calls the SLA endpoint with the bearer header.
DO $run$
BEGIN
  EXECUTE (SELECT command FROM cron.job WHERE jobname = 'hd-sla-every-5-min');
END
$run$;
SELECT is(
  (SELECT url FROM net.stub_requests ORDER BY id DESC LIMIT 1),
  'https://ticket-system-sigma-pink.vercel.app/api/cron/sla',
  'the job calls the SLA endpoint'
);
SELECT is(
  (SELECT headers ->> 'Authorization' FROM net.stub_requests ORDER BY id DESC LIMIT 1),
  'Bearer ci-secret-value-that-is-at-least-32-characters',
  'the job sends the Vault secret as a bearer token'
);

SELECT * FROM finish();
ROLLBACK;
