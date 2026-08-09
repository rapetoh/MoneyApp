-- Migration 020 — Recurrence anchors + the explicit occurrence-date dedup
-- key (fix-plan 1.5, "one recurrence engine" — audit 03-F8, 03-F15,
-- 03-F16, 03-F23, 03-F32, 04-F2, 04-F3, 04-F20, 04-F21, 06-F22, 07-F22).
--
-- Part 1 — anchors. "Next occurrence" used to be recomputed by mutating
-- the previously *emitted* occurrence (`last_generated + one interval`
-- via `Date.prototype.setMonth`/`setDate`/`setFullYear`), which (a)
-- overflows instead of clamping at month ends — a rule anchored on the
-- 31st permanently drifted to the 3rd after the first February — and
-- (b) re-derives the day-of-month from whatever the previous, possibly
-- already-drifted occurrence landed on, rather than from the rule's
-- true anchor. `anchor_day` / `anchor_weekday` / `anchor_time` make the
-- anchor an explicit, stored fact instead of something re-derived every
-- cycle. They are nullable and NOT backfilled onto a NOT NULL
-- constraint deliberately: `packages/shared/src/domain/recurrence.ts`
-- derives them from `starts_at` when absent, and no write path in this
-- repo populates them yet (adopting them at every `recurring_rules`
-- insert site is fix-plan Stage 2) — a NOT NULL constraint here would
-- reject every one of those un-adopted inserts outright, not just leave
-- them less precise.
--
-- Part 2 — the dedup key. Migration 008 (narrowed by migration 013) keys
-- `idx_txn_recurring_dedup` on `(transacted_at AT TIME ZONE 'UTC')::date`
-- — the UTC calendar day. The two writers (the Edge Function, running in
-- UTC, and the mobile catch-up, running in the device's zone) resolve
-- the *same* rule's occurrence to instants that land on different UTC
-- days whenever the occurrence falls within the user's UTC offset of
-- local midnight — which for most non-UTC users is "any bill logged in
-- the evening". The index then sees two distinct keys and both rows
-- survive: a duplicated bill or paycheck twice a year, around the March
-- and November DST transitions. `occurrence_date` is the writer's own
-- resolved civil day (`packages/shared/src/domain/recurrence.ts`'s
-- `Occurrence.occurrenceDate`, `packages/shared/src/utils/period.ts`'s
-- `localDay`) — an explicit business key instead of a reinterpretation
-- of the payload, so the invariant means what it says regardless of
-- which writer or which zone produced the row. Also nullable, for the
-- same reason as the anchors: `apps/mobile/src/services/
-- recurringCatchUp.ts` is not among this item's adopted call sites
-- (fix-plan Stage 2), and a NOT NULL constraint would reject its
-- inserts, which don't supply it, rather than just leave them
-- unprotected by the *new* form of the guard (they remain protected by
-- migration 013's guard shape via the local SQLite mirror's own
-- fallback — see `apps/mobile/src/services/sync/localDb.ts`).

BEGIN;

-- ============================================================
-- 1. Anchor columns on recurring_rules.
-- ============================================================
ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS anchor_day smallint
    CHECK (anchor_day IS NULL OR anchor_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS anchor_weekday smallint
    CHECK (anchor_weekday IS NULL OR anchor_weekday BETWEEN 1 AND 7),
  ADD COLUMN IF NOT EXISTS anchor_time time;

COMMENT ON COLUMN public.recurring_rules.anchor_day IS
  'Day-of-month (1-31) every monthly/quarterly/yearly occurrence clamps '
  'to. Nullable — packages/shared/src/domain/recurrence.ts derives it '
  'from starts_at (in the profile''s timezone) when absent.';
COMMENT ON COLUMN public.recurring_rules.anchor_weekday IS
  'ISO weekday (1=Monday..7=Sunday) the rule was anchored on. '
  'Descriptive only — weekly/biweekly stepping is +7n/+14n days, which '
  'preserves the weekday by construction and never reads this column.';
COMMENT ON COLUMN public.recurring_rules.anchor_time IS
  'Wall-clock time-of-day (in the profile''s timezone) every occurrence '
  'resolves to. Pinning this, rather than inheriting the previous '
  'occurrence''s own resolved hour, is what stops the local hour '
  'drifting across a DST transition (audit 04-F20).';

-- Backfill from starts_at at the owning profile's timezone. Same
-- accepted limitation as migration 017's local_day backfill: every
-- production profile reads the schema default 'UTC' as of this
-- migration, so historical anchors are only as accurate as that
-- default — not a defect in this migration, a consequence of zones
-- never having been captured retroactively.
UPDATE public.recurring_rules r
SET anchor_day = EXTRACT(DAY FROM (r.starts_at AT TIME ZONE COALESCE(p.timezone, 'UTC')))::smallint,
    anchor_weekday = EXTRACT(ISODOW FROM (r.starts_at AT TIME ZONE COALESCE(p.timezone, 'UTC')))::smallint,
    anchor_time = (r.starts_at AT TIME ZONE COALESCE(p.timezone, 'UTC'))::time
FROM public.profiles p
WHERE p.id = r.user_id
  AND r.anchor_day IS NULL;

-- ============================================================
-- 2. occurrence_date on transactions — the explicit dedup key.
-- ============================================================
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS occurrence_date date;

COMMENT ON COLUMN public.transactions.occurrence_date IS
  'The recurrence engine''s resolved civil day (profile timezone) for a '
  'recurring-generated row — the dedup key idx_txn_recurring_dedup uses '
  'below, superseding the UTC-cast (transacted_at AT TIME ZONE ''UTC'') '
  '::date key migrations 008/013 used. NULL for non-recurring rows and '
  'for recurring rows written by a client that has not adopted this '
  'column yet (fix-plan Stage 2).';

-- Backfill from local_day (migration 017), which already resolves the
-- same "civil day in the owning profile's zone" value this column
-- means, for every recurring-generated row on disk today (production
-- has zero, per the audit — this is here so a restore or a
-- non-production environment with real rows backfills correctly).
UPDATE public.transactions
SET occurrence_date = local_day
WHERE recurring_rule_id IS NOT NULL
  AND occurrence_date IS NULL;

-- ============================================================
-- 3. Re-key the dedup index. Supersedes migration 013's redefinition
--    of migration 008's index (same name, same predicate shape, new
--    key column). NULLs remain distinct under a unique index, so rows
--    from a writer that hasn't adopted occurrence_date yet (Stage 2)
--    are simply unprotected by this index, not rejected by it — they
--    keep whatever protection the pre-existing local guards provide.
-- ============================================================
DROP INDEX IF EXISTS public.idx_txn_recurring_dedup;

CREATE UNIQUE INDEX idx_txn_recurring_dedup
ON public.transactions (
  user_id,
  recurring_rule_id,
  occurrence_date
)
WHERE recurring_rule_id IS NOT NULL
  AND is_deleted = false
  AND source = 'recurring_generated';

COMMIT;
