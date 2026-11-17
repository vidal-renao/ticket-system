-- SLA sweep every five minutes: pg_cron + pg_net + Supabase Vault.
--
-- Spec REQ-F1-02, decision D5-A (DECISIONS.md ADR-017). Vercel's Hobby plan
-- runs a cron at most once a day, and an SLA with a one-hour response target
-- cannot be watched once a day. This schedules, inside the database, a job
-- that calls the existing endpoint:
--
--   GET https://ticket-system-sigma-pink.vercel.app/api/cron/sla
--   Authorization: Bearer <secret>
--
-- every five minutes. The daily Vercel cron in vercel.json stays as a backup.
--
-- THE SECRET IS NOT IN THIS FILE and is not stored in cron.job either. The job
-- reads it from Supabase Vault each time it fires:
--
--   select decrypted_secret from vault.decrypted_secrets where name = 'hd_cron_secret'
--
-- so rotating it is a Vault update, with no migration and no re-schedule.
--
-- MANUAL STEP, ONCE, BEFORE (OR AFTER) APPLYING -- run in the SQL editor, with
-- the same value as the CRON_SECRET environment variable in Vercel (at least
-- 32 characters; the endpoint answers 503 to anything shorter):
--
--   select vault.create_secret('<same value as Vercel CRON_SECRET>', 'hd_cron_secret');
--
-- Then apply (or re-apply) this migration. To rotate later:
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'hd_cron_secret'),
--     '<new value>');
--
-- WHAT THIS MIGRATION DOES WHEN SOMETHING IS MISSING -- it never fails, it
-- says what it skipped with a NOTICE and leaves the database as it was:
--   * pg_cron or pg_net not installed and not installable (plain PostgreSQL,
--     CI)                                          -> nothing scheduled
--   * Vault not available                          -> nothing scheduled
--   * no Vault secret named 'hd_cron_secret'       -> nothing scheduled
-- Re-run it once the missing piece is in place.
--
-- IDEMPOTENCY: an existing job named 'hd-sla-every-5-min' is unscheduled
-- before the job is scheduled again, so there is always at most one.
--
-- VERIFY:
--   select jobid, jobname, schedule, active from cron.job
--    where jobname = 'hd-sla-every-5-min';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'hd-sla-every-5-min')
--    order by start_time desc limit 5;
--   select status_code, created from net._http_response order by created desc limit 5;
--     -- 200 = sweep ran, 401 = the Vault value differs from CRON_SECRET,
--     -- 503 = CRON_SECRET is unset or shorter than 32 characters in Vercel
--
-- ROLLBACK:
--   select cron.unschedule('hd-sla-every-5-min');
--   -- optionally: delete from vault.secrets where name = 'hd_cron_secret';
--   -- The extensions are left installed: other applications on this shared
--   -- project use them.

do $schedule$
declare
  v_job_name constant text := 'hd-sla-every-5-min';
  v_has_secret boolean := false;
  v_job_id bigint;
begin
  -- pg_cron lives in pg_catalog and creates the cron schema; pg_net is
  -- installed in the extensions schema on this project and exposes its
  -- functions in the net schema. Both already exist in production; the
  -- CREATE is for a fresh environment and is attempted only where the
  -- extension is actually available.
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron with schema pg_catalog;
    exception when others then
      raise notice 'sla pg_cron: could not create extension pg_cron (%).', sqlerrm;
    end;
  end if;

  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')
     and exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_net') then
    begin
      create schema if not exists extensions;
      create extension if not exists pg_net with schema extensions;
    exception when others then
      raise notice 'sla pg_cron: could not create extension pg_net (%).', sqlerrm;
    end;
  end if;

  if to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('cron.unschedule(text)') is null
     or to_regclass('cron.job') is null then
    raise notice 'sla pg_cron: pg_cron is not available on this database; job % NOT scheduled.', v_job_name;
    return;
  end if;

  if to_regproc('net.http_get') is null then
    raise notice 'sla pg_cron: pg_net is not available on this database; job % NOT scheduled.', v_job_name;
    return;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'sla pg_cron: Supabase Vault is not available on this database; job % NOT scheduled.', v_job_name;
    return;
  end if;

  -- Only whether the secret exists is read here; its value never enters this
  -- session.
  execute $q$ select exists (select 1 from vault.decrypted_secrets where name = 'hd_cron_secret') $q$
     into v_has_secret;

  if not v_has_secret then
    raise notice 'sla pg_cron: Vault secret "hd_cron_secret" not found; job % NOT scheduled. Create it (see the header of this migration) and re-run.', v_job_name;
    return;
  end if;

  if exists (select 1 from cron.job where jobname = v_job_name) then
    perform cron.unschedule(v_job_name);
  end if;

  select cron.schedule(
    v_job_name,
    '*/5 * * * *',
    $job$
    select net.http_get(
      url := 'https://ticket-system-sigma-pink.vercel.app/api/cron/sla',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'hd_cron_secret')
      ),
      timeout_milliseconds := 60000
    );
    $job$
  ) into v_job_id;

  raise notice 'sla pg_cron: job % scheduled every 5 minutes (jobid %).', v_job_name, v_job_id;
end
$schedule$;
