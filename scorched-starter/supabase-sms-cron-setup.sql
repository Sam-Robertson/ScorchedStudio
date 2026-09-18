-- Run this in the Supabase SQL editor to drive the SMS worker from Postgres
-- instead of Vercel Cron.
--
-- Why this exists: Vercel Hobby allows only daily cron jobs, and it rejects the
-- entire deploy if any schedule runs more often. The SMS worker needs to run
-- every 5 minutes, because one run may send SMS_MAX_PER_MINUTE times that
-- interval and a campaign is paced rather than blasted. pg_cron has no such
-- limit and the project already depends on Supabase, so this removes a paid
-- plan from the critical path rather than adding a third-party scheduler.
--
-- NOT APPLIED. Like supabase-marketing-setup.sql, this is left for a human to
-- run: the only Supabase credentials in this repo are production.
--
-- Prerequisites: run supabase-marketing-setup.sql first. This file only
-- schedules the worker; it does not create the tables the worker reads.

-- ---------------------------------------------------------------------------
-- Extensions
--
-- Both live in the `extensions` schema on Supabase rather than public, which is
-- the platform convention and keeps them out of the way of application tables.
-- ---------------------------------------------------------------------------
-- If either line fails on a permissions error, enable them from the dashboard
-- (Database, then Extensions) and re-run this file. Some projects do not allow
-- creating extensions from the SQL editor.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Configuration, held in Vault.
--
-- The bearer token is the same CRON_SECRET the route already checks, so it must
-- never be written into this file or into cron.job.command, both of which are
-- readable by anyone with database access. Vault keeps it encrypted at rest and
-- the function below reads it at call time.
--
-- The URL is not secret. It lives here anyway so that this migration is
-- identical across environments: a staging project points at a staging URL by
-- changing one row rather than by editing and re-running SQL.
--
-- Set both of these BEFORE scheduling the job. Replace the placeholder values.
-- ---------------------------------------------------------------------------

-- Run this block once, with your real values substituted. It is separated from
-- the rest so you can re-run the file later without re-entering secrets.
--
--   select vault.create_secret(
--     'https://www.scorchedstudio.com/api/cron/sms-worker',
--     'sms_worker_url',
--     'Endpoint pg_cron calls to drain the marketing SMS queue'
--   );
--
--   select vault.create_secret(
--     '<the same value as CRON_SECRET in Vercel>',
--     'sms_worker_cron_secret',
--     'Bearer token for /api/cron/sms-worker; must match CRON_SECRET'
--   );
--
-- To rotate either one later, find its id and use vault.update_secret:
--
--   select id, name from vault.decrypted_secrets where name like 'sms_worker%';
--   select vault.update_secret('<id>', '<new value>');

-- ---------------------------------------------------------------------------
-- invoke_sms_worker(): the thing the schedule actually calls.
--
-- Wrapped in a function rather than inlining the HTTP call in the cron command
-- for three reasons: the command text stays free of anything sensitive, the
-- call can be tested by hand with a single select, and the schedule does not
-- have to be rewritten when the request shape changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_sms_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned so a caller cannot shadow `vault` or `net` with their own schema and
-- capture the secret. Required for any SECURITY DEFINER function.
SET search_path = public, extensions, vault, pg_temp
AS $$
DECLARE
  worker_url    text;
  worker_secret text;
  request_id    bigint;
BEGIN
  SELECT decrypted_secret INTO worker_url
    FROM vault.decrypted_secrets WHERE name = 'sms_worker_url';

  SELECT decrypted_secret INTO worker_secret
    FROM vault.decrypted_secrets WHERE name = 'sms_worker_cron_secret';

  -- Fail loudly rather than firing an unauthenticated request that the route
  -- will 401, which would look like a working schedule in cron.job_run_details.
  IF worker_url IS NULL OR worker_secret IS NULL THEN
    RAISE EXCEPTION
      'invoke_sms_worker: missing Vault secrets. Create sms_worker_url and sms_worker_cron_secret first.';
  END IF;

  -- The route is a GET handler. Timeout is generous because a run sends real
  -- messages one at a time and can take tens of seconds; it stays well under
  -- the 5 minute interval, and an overlapping run is harmless anyway because
  -- the worker takes a single-runner lease before doing anything.
  SELECT net.http_get(
    url := worker_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || worker_secret,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

-- Nobody but the scheduler needs this. Without the revoke, any signed-in user
-- could trigger a send cycle through PostgREST.
REVOKE ALL ON FUNCTION public.invoke_sms_worker() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_sms_worker() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- The schedule.
--
-- Unscheduled first so re-running this file replaces the job instead of
-- creating a second one that doubles the send rate.
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('sms-worker')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sms-worker');

SELECT cron.schedule(
  'sms-worker',
  '*/5 * * * *',
  $$SELECT public.invoke_sms_worker();$$
);

-- ---------------------------------------------------------------------------
-- sms_worker_cron_health: what to look at when nothing is sending.
--
-- pg_cron records whether the SQL ran, and pg_net separately records what the
-- HTTP call returned. A job can show 'succeeded' while every request 401s, so
-- both halves have to be read together. This view joins them.
--
-- pg_net keeps responses for about 6 hours, so older runs show a null status.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.sms_worker_cron_health AS
SELECT
  d.runid,
  d.start_time,
  d.status        AS cron_status,
  d.return_message,
  r.status_code   AS http_status,
  r.error_msg     AS http_error,
  r.content       AS response_body
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
LEFT JOIN net._http_response r
  -- The function returns the pg_net request id, and pg_cron records it as the
  -- run's return message, which is what lets the two sides be joined at all.
  ON r.id::text = d.return_message
WHERE j.jobname = 'sms-worker'
ORDER BY d.start_time DESC;

REVOKE ALL ON public.sms_worker_cron_health FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Checks to run by hand after applying.
--
--   -- the job exists and is active
--   select jobname, schedule, active from cron.job where jobname = 'sms-worker';
--
--   -- fire it once now, without waiting 5 minutes
--   select public.invoke_sms_worker();
--
--   -- then, a few seconds later, confirm the route answered 200
--   select * from net._http_response order by created desc limit 1;
--
--   -- ongoing
--   select * from public.sms_worker_cron_health limit 20;
--
-- To stop the schedule entirely:
--
--   select cron.unschedule('sms-worker');
-- ---------------------------------------------------------------------------
