-- Migration 023 — FX backfill sweep cron schedule, credential in Vault.
--
-- Background (fix-plan 1.4, Change part 3). The FX backfill sweep that
-- fills in `amount_in_profile_currency` for historical foreign-currency
-- transactions (migration 011) only ran client-side, on mobile app
-- launch. A web-only user's foreign-currency rows never got a client
-- willing to run the sweep, so they stayed NULL — and NULL rows are
-- excluded from every total rather than counted as $0
-- (`isFxPending`/`summarize()`), so those totals were silently short
-- forever. `supabase/functions/fx-backfill/index.ts` is the same sweep
-- moved server-side; this migration schedules it, following the exact
-- vault-key pattern migration 015 established for `generate-recurring`:
--
--   secret name:  fx_backfill_key
--
-- The secret VALUE is provisioned out of band — never committed, never
-- inlined here or in cron.job.command. To (re)provision after rotating
-- the key, run once against the database:
--
--   select vault.create_secret('<rotated secret key>', 'fx_backfill_key');
--
-- Rotation = update the Vault secret; the job picks it up on its next
-- run with no cron change. If the secret is absent the job logs a
-- warning and no-ops instead of failing on every tick. `select command
-- from cron.job` must never match sb_secret_ / service_role / eyJ.
--
-- Every 15 minutes, not once a day like `generate-recurring`: this
-- sweep exists to close a *user-visible* gap (a foreign-currency
-- transaction quietly missing from every total until it's converted),
-- and the function caps itself at 200 rows per tick
-- (supabase/functions/fx-backfill/index.ts), so a large backlog drains
-- over a handful of ticks rather than blocking one long run.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent re-create: drop any existing job of this name, then
-- schedule fresh.
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'fx-backfill-sweep';

SELECT cron.schedule(
  'fx-backfill-sweep',
  '*/15 * * * *',
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
       WHERE name = 'fx_backfill_key';
    END IF;

    IF v_key IS NULL OR v_key = '' THEN
      RAISE WARNING 'fx-backfill-sweep: vault secret "fx_backfill_key" is not set; skipping run';
      RETURN;
    END IF;

    PERFORM net.http_post(
      url     := 'https://ohaqhwampmyoeaopdybd.supabase.co/functions/v1/fx-backfill',
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
