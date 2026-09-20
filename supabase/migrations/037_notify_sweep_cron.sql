-- Migration 037: the notification sweep's schedule, credential in Vault.
--
-- Runs `notify-sweep` (supabase/functions/notify-sweep/index.ts) once an
-- hour. Hourly, not daily, because the sweep's job is to catch a user
-- inside their own evening: every timezone reaches 19:00 at a different
-- UTC hour, and a daily run could only ever be right for one of them.
-- Each run is cheap for anyone it cannot send to: quiet hours and the
-- one-a-day ceiling are checked before any engine work happens, so the
-- common case is a couple of indexed reads and a skip.
--
-- Credential handling follows migrations 015 and 023 exactly:
--
--   secret name:  notify_sweep_key
--
-- The secret VALUE is provisioned out of band, never committed, never
-- inlined here or in cron.job.command. To (re)provision after rotating
-- the key, run once against the database:
--
--   select vault.create_secret('<secret key>', 'notify_sweep_key');
--
-- Rotation = update the Vault secret; the job picks it up on its next
-- run with no cron change. If the secret is absent the job logs a warning
-- and no-ops instead of failing every hour. `select command from cron.job`
-- must never match sb_secret_ / service_role / eyJ.
--
-- DEPLOY ORDER: migration 036 first (the tables the sweep reads and
-- writes), then `supabase functions deploy notify-sweep`, then this. A
-- schedule pointing at a function that does not exist yet just logs
-- failures every hour.
--
-- To pause all outbound notifications in an incident, without a deploy:
--   select cron.unschedule('notify-sweep-hourly');
-- Re-running this migration restores it.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent re-create: drop any existing job of this name, then
-- schedule fresh.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'notify-sweep-hourly';

SELECT cron.schedule(
  'notify-sweep-hourly',
  -- Ten past the hour: clear of the top-of-hour crowd, and well clear of
  -- generate-recurring at 06:00, whose rows the sweep wants to see as
  -- settled rather than half-written.
  '10 * * * *',
  $cron$
  DO $job$
  DECLARE
    v_key text;
  BEGIN
    -- The Vault view may be absent (fresh local stack without the
    -- supabase_vault extension); the statement inside the guard is
    -- only planned when the view exists.
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets
       WHERE name = 'notify_sweep_key';
    END IF;

    IF v_key IS NULL OR v_key = '' THEN
      RAISE WARNING 'notify-sweep-hourly: vault secret "notify_sweep_key" is not set; skipping run';
      RETURN;
    END IF;

    PERFORM net.http_post(
      url     := 'https://ohaqhwampmyoeaopdybd.supabase.co/functions/v1/notify-sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  END
  $job$;
  $cron$
);

COMMIT;
