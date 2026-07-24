-- Migration 011 — Per-transaction FX snapshot for multi-currency math.
--
-- Background. Every aggregation in the app (Today's spend, Insights
-- totals, Budget rings, Export totals, Ask Murmur reasoning) sums
-- `transactions.amount` blindly across currencies. A user with a €50
-- dinner in an otherwise-USD account saw `$2,000 + €50 = $2,050` on
-- their Overview, treating the euro figure as if it were dollars.
-- LOGIC_REVIEW.md §2.1 covered the scope.
--
-- Fix shape. Snapshot the FX rate at the time of the transaction and
-- persist `amount_in_profile_currency` alongside `amount`. The
-- snapshot is what aggregations sum. New transactions look up the
-- rate at save time (free, ECB-sourced, via frankfurter.app —
-- `packages/shared/src/utils/fx.ts`). Same-currency rows are trivial
-- (rate = 1) and the migration backfills them in place. Foreign-
-- currency historical rows stay NULL until a follow-up backfill
-- runs; the application excludes NULL rows from aggregations rather
-- than silently lying with the unconverted amount.
--
-- Two reasons we snapshot at write-time rather than convert at
-- read-time:
--   1. Permanence — "that €50 dinner was $54.20 in August 2024" stays
--      true forever even as today's EUR/USD rate moves.
--   2. Performance — aggregations stay pure SQL sums, no rate-table
--      lookup per row.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS amount_in_profile_currency numeric(14, 2),
  ADD COLUMN IF NOT EXISTS fx_rate_to_profile         numeric(18, 8),
  ADD COLUMN IF NOT EXISTS fx_rate_date               date;

-- Backfill the trivial case: any transaction whose `currency_code`
-- already matches the user's profile currency. Rate is exactly 1.
-- This covers single-currency users entirely. Foreign-currency rows
-- stay NULL and will be filled by a client-side or server-side
-- backfill that hits the FX provider.
UPDATE public.transactions AS t
SET amount_in_profile_currency = t.amount,
    fx_rate_to_profile         = 1.0,
    fx_rate_date               = (t.transacted_at AT TIME ZONE 'UTC')::date
FROM public.profiles AS p
WHERE p.id = t.user_id
  AND p.currency_code = t.currency_code
  AND t.amount_in_profile_currency IS NULL;

-- Index for the "find rows that still need backfill" query the
-- client will run on launch. Partial so it stays small on accounts
-- where every row is already filled in (the common case).
CREATE INDEX IF NOT EXISTS idx_txn_needs_fx_backfill
ON public.transactions (user_id, transacted_at)
WHERE amount_in_profile_currency IS NULL AND is_deleted = false;
