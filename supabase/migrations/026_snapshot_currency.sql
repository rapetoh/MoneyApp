-- Migration 026 — `snapshot_currency` + `profiles.monthly_income_currency`
-- (fix-plan 2.7, "Currency change as a migration, not a label swap" —
-- audit 05-F13, 06-F8, 08-F5).
--
-- Background. `amount_in_profile_currency` is a write-time snapshot
-- (migration 011): the transaction's own currency, converted at the
-- historical rate on the day it happened, into whatever currency the
-- profile carried *at write time*. Nothing has ever recorded which
-- currency that snapshot actually targets. Changing `profiles.currency_code`
-- has therefore always been a bare column write — every historical
-- `amount_in_profile_currency` keeps its old magnitude and silently
-- acquires a new label. A $10,000 year becomes "€10,000" with one tap,
-- permanently, and Ask Murmur is then told `currency: EUR` while the
-- numbers underneath are still dollars.
--
-- `snapshot_currency` fixes the missing half of that invariant: every
-- filled `amount_in_profile_currency` now travels with the currency it
-- was actually computed for. That does two things:
--
--   1. Lets a currency change (`supabase/functions/change-currency`)
--      distinguish "already converted for the new currency" from
--      "still holds a stale snapshot" while it works through a user's
--      history in batches — the operation is resumable across
--      invocations precisely because this column lets it pick up where
--      a prior run left off instead of re-converting everything (or,
--      worse, having no way to tell what still needs it).
--   2. Lets the FX backfill sweep (`apps/mobile/src/services/fxBackfill.ts`,
--      `supabase/functions/fx-backfill`) self-heal after an interrupted
--      or pre-2.7 currency change: its predicate becomes
--      `amount_in_profile_currency IS NULL OR snapshot_currency <>
--      profiles.currency_code` instead of only ever looking at NULL.
--
-- `profiles.monthly_income_currency` closes the matching gap on
-- `monthly_income`: it has always been a bare `numeric` with no
-- currency of its own, implicitly assumed to be in whatever currency
-- `profiles.currency_code` currently holds — which breaks the moment
-- that assumption is untrue mid-conversion. Ask Murmur's affordability
-- reasoning reads `monthly_income` directly, so a stale label here is
-- the same class of silent-wrong-money bug as the transaction one.
--
-- Both new columns carry the same three-uppercase-letter format CHECK
-- migration 021 put on `transactions.currency_code` — a format check,
-- not the full ISO 4217 allow-list, for the same reason 021 gives.

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS snapshot_currency text;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_snapshot_currency_format
  CHECK (snapshot_currency IS NULL OR snapshot_currency ~ '^[A-Z]{3}$');

-- Backfill: every row that already has a filled snapshot today was
-- necessarily snapshotted for the profile's *current* currency — no
-- code path before this migration could produce a snapshot in any other
-- currency, since a currency change has never been anything but a bare
-- label swap. This is the one-time correction that makes the invariant
-- "amount_in_profile_currency IS NOT NULL => snapshot_currency IS NOT NULL"
-- hold from this migration forward; `change-currency` and `fxBackfill`
-- both maintain it on every write from here on.
UPDATE public.transactions AS t
SET snapshot_currency = p.currency_code
FROM public.profiles AS p
WHERE p.id = t.user_id
  AND t.amount_in_profile_currency IS NOT NULL
  AND t.snapshot_currency IS NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_income_currency text DEFAULT 'USD';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_monthly_income_currency_format
  CHECK (monthly_income_currency IS NULL OR monthly_income_currency ~ '^[A-Z]{3}$');

-- Same reasoning as the transactions backfill above: every profile's
-- existing `monthly_income` was always implicitly in `currency_code`
-- (no code path has ever converted it), so that is the only correct
-- backfill value.
UPDATE public.profiles
SET monthly_income_currency = currency_code
WHERE monthly_income_currency IS DISTINCT FROM currency_code;

COMMIT;
