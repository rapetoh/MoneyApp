-- Migration 017 — Store the resolved local day on every transaction
-- (audit 04-F4, 04-F10, 04-F17, 04-F29, 04-F30, 04-F32, 06-F11, 07-F14,
-- 07-F37, 05-F16 — fix-plan item 1.3, part 3: "Store the resolved day").
--
-- transacted_at stays `timestamptz` — an absolute instant, always
-- rendered as UTC on the wire. That is already correct and does not
-- change here. What has never existed is a single, authoritative answer
-- to "which calendar day does this transaction belong to", so every
-- reader picked its own: Vercel-UTC on server components, browser-local
-- on client components, device-local on mobile, `AT TIME ZONE 'UTC'` in
-- migrations 008 and 011.
--
-- `local_day` is the fix: the calendar day the transacting *client*
-- resolved the event to, in the user's zone, at write time —
-- `packages/shared/src/utils/period.ts`'s `localDay(transactedAt,
-- profile.timezone)`. It is written once, by whichever client creates
-- the row, and never recomputed by a reader. Readers group by this
-- column directly; range filters (a month, a week, a budget period)
-- compare `transacted_at` against the instant bounds `period.ts`
-- produces. This is what makes the invariant enforceable rather than
-- conventional — a reader cannot silently drift back to `getMonth()`
-- because there is nothing left to hand-roll.
--
-- Backfill: existing rows resolve `local_day` from `transacted_at` at
-- the owning profile's stored `timezone`. Every production profile
-- reads 'UTC' as of this migration (fix-plan 1.3, part 1, has not
-- backfilled real device zones retroactively — it only starts
-- capturing them going forward) so historical backfilled days are only
-- as accurate as that default; this is a known, accepted limitation of
-- backfilling data that was never written with a zone in the first
-- place, not a defect in this migration.
--
-- Application-side adoption of this column (transactionStore.ts, the
-- web insert routes) is fix-plan Stage 2 — this migration only adds the
-- column, its index, and the historical backfill.

BEGIN;

-- ============================================================
-- 1. Add the column (nullable first — a NOT NULL column can't be
--    added in the same statement as a backfill on a non-empty table).
-- ============================================================
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS local_day date;

-- ============================================================
-- 2. Backfill from transacted_at at the owning profile's zone.
-- ============================================================
UPDATE public.transactions t
SET local_day = (t.transacted_at AT TIME ZONE COALESCE(p.timezone, 'UTC'))::date
FROM public.profiles p
WHERE p.id = t.user_id
  AND t.local_day IS NULL;

-- Orphaned rows with no matching profile (should not exist under the
-- FK, but a restore/import path could produce one) fall back to UTC
-- rather than blocking the NOT NULL constraint below.
UPDATE public.transactions
SET local_day = (transacted_at AT TIME ZONE 'UTC')::date
WHERE local_day IS NULL;

-- ============================================================
-- 3. Enforce the invariant going forward.
-- ============================================================
ALTER TABLE public.transactions ALTER COLUMN local_day SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_local_day ON public.transactions(user_id, local_day);

COMMIT;
