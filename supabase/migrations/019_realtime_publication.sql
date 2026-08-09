-- Migration 019 — Publish the tables realtime subscribers actually listen
-- to (fix-plan 1.6 point 8).
--
-- Every `postgres_changes` handler in this codebase (mobile's SyncManager,
-- and any other client subscribing the same way) has always been
-- registered against `supabase_realtime` — but nothing ever added
-- `transactions`, `categories`, `budgets` or `recurring_rules` to that
-- publication via a tracked migration. Supabase projects ship the
-- `supabase_realtime` publication empty by default; a table only starts
-- emitting change events once it is explicitly added, normally via a
-- dashboard toggle that (unlike this file) leaves no record in the repo
-- and does not apply to a fresh project created from these migrations.
-- Every realtime subscription this app has ever opened has therefore been
-- listening to a publication containing zero tables.
--
-- `ADD TABLE` is not idempotent pre-15 (no `IF NOT EXISTS`), and re-running
-- it errors on a project where a table was already added by hand — the
-- DO block below adds each table only if `pg_publication_tables` doesn't
-- already list it, so this migration is safe to apply to a project in
-- either state.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions', 'categories', 'budgets', 'recurring_rules']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
