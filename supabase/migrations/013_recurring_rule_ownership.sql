-- Migration 013 — Server-side ownership of recurring-rule creation.
--
-- Background. "Mark as recurring" has never produced a recurring_rules row
-- in production. The mobile client saved the transaction offline-first
-- (SQLite + sync queue, drainQueue fire-and-forget) and then immediately
-- inserted the rule directly into Supabase with template_txn_id pointing at
-- a transaction the server had not received yet. The insert died on
-- fk_template_txn (23503), the error was swallowed by a console.warn, and
-- the user saw a successful save. Result: transactions with
-- is_recurring = true, recurring_rule_id NULL, and an eternally empty
-- recurring_rules table.
--
-- Fix. The transaction row itself now carries the full recurring intent
-- (is_recurring + recurring_frequency), and a trigger on public.transactions
-- creates-or-links the rule in the same database transaction as the row
-- write. No client-side rule insert can race the sync queue, and every
-- writer (mobile, web, desktop, future imports) converges on the same
-- behavior by construction.
--
-- Also here:
--   * idx_txn_recurring_dedup narrowed to source = 'recurring_generated'.
--     Its real semantic is "one engine-generated occurrence per (rule, day)".
--     Now that user-entered template transactions get recurring_rule_id set
--     too, the old broader predicate would 23505 when a user manually logs
--     a bill on the same day the cron generates it.
--   * Backfill: existing flagged-but-orphaned rows (the user's Xtream and
--     Charles Schwab entries) get their rules created and linked.

BEGIN;

-- ============================================================
-- 1. Durable carrier of the user's chosen cadence
-- ============================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurring_frequency text
  CHECK (recurring_frequency IS NULL OR recurring_frequency IN
         ('daily','weekly','biweekly','monthly','quarterly','yearly'));

COMMENT ON COLUMN public.transactions.recurring_frequency IS
  'Cadence the user chose when marking the transaction recurring. Read by '
  'the link_or_create_recurring_rule trigger; NULL for non-recurring rows '
  'and for rows generated FROM a rule.';

-- ============================================================
-- 2. Dedup index narrowed to engine-generated occurrences
-- ============================================================
DROP INDEX IF EXISTS public.idx_txn_recurring_dedup;
CREATE UNIQUE INDEX idx_txn_recurring_dedup
ON public.transactions (
  user_id,
  recurring_rule_id,
  ((transacted_at AT TIME ZONE 'UTC')::date)
)
WHERE recurring_rule_id IS NOT NULL
  AND is_deleted = false
  AND source = 'recurring_generated';

-- ============================================================
-- 3. One active named rule per (user, direction, name) — makes the
--    trigger's find-or-create race-proof (concurrent inserts collapse
--    into unique_violation, which the function handles by re-selecting).
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_rules_active_name
ON public.recurring_rules (user_id, direction, lower(name))
WHERE is_active AND name IS NOT NULL;

-- ============================================================
-- 4. Create-or-link on flag
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_or_create_recurring_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rule_id uuid;
  v_freq    text := coalesce(NEW.recurring_frequency, 'monthly');
BEGIN
  -- Reuse the user's existing active rule for the same merchant+direction
  -- (marking a second "Xtream" bill recurring must not mint a second rule).
  IF NEW.merchant IS NOT NULL THEN
    SELECT id INTO v_rule_id
    FROM public.recurring_rules
    WHERE user_id = NEW.user_id
      AND direction = NEW.direction
      AND is_active
      AND name IS NOT NULL
      AND lower(name) = lower(NEW.merchant)
    LIMIT 1;
  END IF;

  IF v_rule_id IS NULL THEN
    BEGIN
      INSERT INTO public.recurring_rules (
        user_id, template_txn_id, name, amount, currency_code, category_id,
        frequency, interval, starts_at, last_generated, is_active,
        direction, payment_method, note
      ) VALUES (
        NEW.user_id, NEW.id, NEW.merchant, NEW.amount, NEW.currency_code,
        NEW.category_id, v_freq, 1,
        -- The flagged transaction IS the first occurrence: anchoring both
        -- starts_at and last_generated to it means the generators
        -- (edge function + mobile catch-up, both last_generated + 1 interval)
        -- produce the NEXT occurrence and never back-generate a duplicate
        -- of the row the user just entered.
        NEW.transacted_at, NEW.transacted_at, true,
        NEW.direction, NEW.payment_method, NEW.note
      )
      RETURNING id INTO v_rule_id;
    EXCEPTION WHEN unique_violation THEN
      -- Concurrent writer created the same named rule first — link to it.
      SELECT id INTO v_rule_id
      FROM public.recurring_rules
      WHERE user_id = NEW.user_id
        AND direction = NEW.direction
        AND is_active
        AND name IS NOT NULL
        AND lower(name) = lower(NEW.merchant)
      LIMIT 1;
    END;
  END IF;

  IF v_rule_id IS NOT NULL THEN
    -- Does not list is_recurring in SET, so this cannot re-fire the
    -- UPDATE OF is_recurring triggers; the WHEN guard
    -- (recurring_rule_id IS NULL) makes it doubly recursion-safe.
    UPDATE public.transactions
    SET recurring_rule_id = v_rule_id,
        version = version + 1,
        updated_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================
-- 5. Deactivate on unflag of the template transaction
-- ============================================================
CREATE OR REPLACE FUNCTION public.deactivate_recurring_rule_on_unflag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only the template's unflag deactivates the rule. Unflagging a single
  -- generated occurrence must never kill the schedule behind every other
  -- future occurrence.
  UPDATE public.recurring_rules
  SET is_active = false
  WHERE id = OLD.recurring_rule_id
    AND template_txn_id = OLD.id;

  UPDATE public.transactions
  SET recurring_rule_id = NULL,
      recurring_frequency = NULL,
      version = version + 1,
      updated_at = now()
  WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_txn_recurring_link ON public.transactions;
CREATE TRIGGER trg_txn_recurring_link
AFTER INSERT OR UPDATE OF is_recurring ON public.transactions
FOR EACH ROW
WHEN (NEW.is_recurring AND NEW.recurring_rule_id IS NULL AND NOT NEW.is_deleted)
EXECUTE FUNCTION public.link_or_create_recurring_rule();

DROP TRIGGER IF EXISTS trg_txn_recurring_unflag ON public.transactions;
CREATE TRIGGER trg_txn_recurring_unflag
AFTER UPDATE OF is_recurring ON public.transactions
FOR EACH ROW
WHEN (OLD.is_recurring AND NOT NEW.is_recurring AND OLD.recurring_rule_id IS NOT NULL)
EXECUTE FUNCTION public.deactivate_recurring_rule_on_unflag();

-- ============================================================
-- 6. Backfill — existing flagged rows with no rule (frequency defaults to
--    'monthly', the same default the UI showed when they were saved).
--    Listing is_recurring in SET fires trg_txn_recurring_link per row.
-- ============================================================
UPDATE public.transactions
SET is_recurring = is_recurring
WHERE is_recurring = true
  AND recurring_rule_id IS NULL
  AND is_deleted = false;

-- ============================================================
-- 7. Anchor guard for backfilled rules whose template transaction is
--    older than one cadence period: without this, the daily generator and
--    the mobile catch-up would retroactively spray months of "missed"
--    occurrences the user never actually incurred. Advancing
--    last_generated to now() makes the next occurrence land one period
--    from today instead. No-op on fresh databases and on rules whose next
--    occurrence is already in the future.
-- ============================================================
UPDATE public.recurring_rules
SET last_generated = now()
WHERE is_active
  AND (
    CASE frequency
      WHEN 'daily'     THEN last_generated + (interval '1 day'    * "interval")
      WHEN 'weekly'    THEN last_generated + (interval '7 days'   * "interval")
      WHEN 'biweekly'  THEN last_generated + (interval '14 days'  * "interval")
      WHEN 'monthly'   THEN last_generated + (interval '1 month'  * "interval")
      WHEN 'quarterly' THEN last_generated + (interval '3 months' * "interval")
      WHEN 'yearly'    THEN last_generated + (interval '1 year'   * "interval")
    END
  ) < now();

COMMIT;
