-- Migration 015 — Recurring generator cron schedule, credential in Vault.
--
-- Background (audit 03-F14). The `generate-recurring-daily` cron job existed
-- only in the production database, created by hand from a recipe comment, with
-- the `sb_secret_*` Supabase secret key pasted as a literal into
-- `cron.job.command`. That put a full-RLS-bypass credential into a system
-- catalog, every logical backup, and every support export — and a project
-- restore from this repo silently lost the schedule entirely.
--
-- Fix. The schedule is now a repo artifact (this file), and the command reads
-- the key from Supabase Vault at call time instead of embedding it:
--
--   secret name:  generate_recurring_key
--
-- The secret VALUE is provisioned out of band — never committed, never inlined
-- here or in cron.job.command. To (re)provision after rotating the key, run
-- once against the database:
--
--   select vault.create_secret('<rotated secret key>', 'generate_recurring_key');
--
-- Rotation = update the Vault secret; the job picks it up on its next run with
-- no cron change. If the secret is absent the job logs a warning and no-ops
-- instead of failing daily. `select command from cron.job` must never match
-- sb_secret_ / service_role / eyJ.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent re-create: drop any existing job of this name (including the
-- original hand-created one carrying the literal key), then schedule fresh.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'generate-recurring-daily';

SELECT cron.schedule(
  'generate-recurring-daily',
  '0 6 * * *',
  $cron$
  DO $job$
  DECLARE
    v_key text;
  BEGIN
    -- The Vault view may be absent (fresh local stack without the
    -- supabase_vault extension); the statement inside the guard is only
    -- planned when the view exists.
    IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
      SELECT decrypted_secret INTO v_key
        FROM vault.decrypted_secrets
       WHERE name = 'generate_recurring_key';
    END IF;

    IF v_key IS NULL OR v_key = '' THEN
      RAISE WARNING 'generate-recurring-daily: vault secret "generate_recurring_key" is not set; skipping run';
      RETURN;
    END IF;

    PERFORM net.http_post(
      url     := 'https://ohaqhwampmyoeaopdybd.supabase.co/functions/v1/generate-recurring',
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
