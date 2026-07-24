-- Migration 009 — One-shot scrub of `raw_transcript` from the server.
--
-- Background. The schema comment on `transactions.raw_transcript` (see
-- 001_initial_schema.sql) and the Privacy screen on mobile
-- (apps/mobile/app/more/privacy.tsx) both promise that voice transcripts
-- are kept on-device, never synced. The mobile sync path was contradicting
-- that promise — the full transaction row, transcript included, was being
-- upserted to Supabase. SyncManager now strips `raw_transcript` from the
-- outbound payload starting with the same code change that ships this
-- migration, so all new rows respect the promise. This migration cleans
-- up the existing data on the server side.
--
-- We don't drop the column. Keeping the column lets a future opt-in
-- ("save transcripts to my account for cross-device review") land
-- without another migration, and the type definitions in
-- packages/shared still expect it as `string | null` on Transaction.

BEGIN;

UPDATE public.transactions
SET raw_transcript = NULL,
    updated_at = now()
WHERE raw_transcript IS NOT NULL;

COMMIT;
