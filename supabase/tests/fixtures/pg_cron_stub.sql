-- Stand-ins for pg_cron, pg_net and Supabase Vault, for sla_pg_cron.sql only.
--
-- None of the three can be installed in the plain PostgreSQL used by CI
-- (pg_cron needs shared_preload_libraries, Vault needs pgsodium). These stubs
-- have the same names and signatures the migration calls, and record what it
-- does, so the scheduling logic of 202611170002 can be asserted: skipped
-- without the secret, exactly one job with it, no secret in the job text.
-- They are test doubles, not an emulation; whether the job really fires is
-- verified in production (see the migration header, VERIFY).
\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text UNIQUE,
  schedule text NOT NULL,
  command text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cron.stub_calls (
  id bigserial PRIMARY KEY,
  call text NOT NULL,
  jobname text NOT NULL
);

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO cron.stub_calls (call, jobname) VALUES ('schedule', job_name);
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, schedule, command)
  RETURNING jobid INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO cron.stub_calls (call, jobname) VALUES ('unschedule', job_name);
  DELETE FROM cron.job WHERE jobname = job_name;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'could not find valid entry for job ''%''', job_name;
  END IF;
  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS net.stub_requests (
  id bigserial PRIMARY KEY,
  url text NOT NULL,
  headers jsonb NOT NULL,
  timeout_milliseconds integer NOT NULL
);

CREATE OR REPLACE FUNCTION net.http_get(
  url text,
  params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO net.stub_requests (url, headers, timeout_milliseconds)
  VALUES (url, headers, timeout_milliseconds)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text UNIQUE,
  secret text NOT NULL
);

CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, secret AS decrypted_secret FROM vault.secrets;

CREATE OR REPLACE FUNCTION vault.create_secret(new_secret text, new_name text)
RETURNS uuid
LANGUAGE sql
AS $$
  INSERT INTO vault.secrets (name, secret) VALUES (new_name, new_secret) RETURNING id;
$$;
