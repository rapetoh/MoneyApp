-- Migration 025 — FX snapshot columns on recurring_rules, and the
-- link_or_create_recurring_rule trigger's Stage-2 adoption of the anchor
-- columns migration 020 added but deliberately left unpopulated
-- (fix-plan 2.1 "Give recurring_rules the FX snapshot columns... so
-- aggAmount can apply — today there is literally nothing to convert
-- with"; 020's own docstring: "adopting them at every recurring_rules
-- insert site is fix-plan Stage 2").
--
-- Part 1 — FX snapshot. `recurring_rules.amount` has never carried a
-- profile-currency figure, so every monthly-equivalent total in the app
-- summed raw amounts across currencies (two rules of EUR 10/mo and
-- USD 10/mo read as a $20/mo total). The transaction that creates or
-- templates a rule already carries its own write-time FX snapshot
-- (migration 011) — `link_or_create_recurring_rule` below copies those
-- three columns straight from NEW rather than doing a second FX lookup.
--
-- Part 2 — anchors. Same trigger, same INSERT: anchor_day/anchor_weekday/
-- anchor_time (migration 020) are now populated from NEW.transacted_at in
-- the owning profile's timezone at create time, instead of relying on
-- packages/shared/src/domain/recurrence.ts's starts_at-derived fallback
-- for every rule this trigger creates from here on.

BEGIN;

-- ============================================================
-- 1. FX snapshot columns.
-- ============================================================
ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS amount_in_profile_currency numeric(14, 2),
  ADD COLUMN IF NOT EXISTS fx_rate_to_profile numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_date date;

COMMENT ON COLUMN public.recurring_rules.amount_in_profile_currency IS
  'amount converted to the owning profile''s currency, snapshotted at '
  'create/update time from the template transaction''s own FX snapshot '
  '(migration 011) or recomputed in place when amount changes (fix-plan '
  '2.1). Null until backfilled/first written — aggregators must treat '
  'null the same way packages/shared/src/domain/money.ts treats a null '
  'transaction snapshot: pending, not zero.';
COMMENT ON COLUMN public.recurring_rules.fx_rate_to_profile IS
  'Ratio used to produce amount_in_profile_currency. 1.0 when '
  'currency_code already matches the profile currency.';
COMMENT ON COLUMN public.recurring_rules.fx_rate_date IS
  'Calendar date the rate above was retrieved for (the rule''s own '
  'starts_at / template transaction date, not "now").';

-- Backfill from each rule's template transaction, where one exists and
-- already carries a snapshot. Rules with no template (none exist in
-- production per the audit — recurring_rules had zero rows) or whose
-- template is itself FX-pending are left null, same accepted-limitation
-- shape as migration 020's anchor backfill.
UPDATE public.recurring_rules r
SET amount_in_profile_currency = t.amount_in_profile_currency,
    fx_rate_to_profile = t.fx_rate_to_profile,
    fx_rate_date = t.fx_rate_date
FROM public.transactions t
WHERE t.id = r.template_txn_id
  AND r.amount_in_profile_currency IS NULL
  AND t.amount_in_profile_currency IS NOT NULL;

-- ============================================================
-- 2. link_or_create_recurring_rule — adopt FX snapshot + anchor columns
--    on the INSERT this function performs. Idempotency/relink logic
--    (migration 014) is unchanged; only the INSERT's column list grows.
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
  v_tz      text;
  v_local   timestamp;
BEGIN
  -- Idempotency: if a rule already templates this transaction (the trigger
  -- ran before and the link got clobbered by a stale client echo), relink it.
  SELECT id INTO v_rule_id
  FROM public.recurring_rules
  WHERE user_id = NEW.user_id
    AND template_txn_id = NEW.id
    AND is_active
  LIMIT 1;

  -- Otherwise reuse the user's existing active rule for the same
  -- merchant+direction (a second "Xtream" bill must not mint a second rule).
  IF v_rule_id IS NULL AND NEW.merchant IS NOT NULL THEN
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
    -- Anchor columns (migration 020): resolved once here, in the owning
    -- profile's timezone, rather than left for recurrence.ts's
    -- starts_at-derived fallback to recompute on every read.
    SELECT COALESCE(p.timezone, 'UTC') INTO v_tz
    FROM public.profiles p WHERE p.id = NEW.user_id;
    v_tz := COALESCE(v_tz, 'UTC');
    v_local := NEW.transacted_at AT TIME ZONE v_tz;

    BEGIN
      INSERT INTO public.recurring_rules (
        user_id, template_txn_id, name, amount, currency_code, category_id,
        frequency, interval, starts_at, last_generated, is_active,
        direction, payment_method, note,
        amount_in_profile_currency, fx_rate_to_profile, fx_rate_date,
        anchor_day, anchor_weekday, anchor_time
      ) VALUES (
        NEW.user_id, NEW.id, NEW.merchant, NEW.amount, NEW.currency_code,
        NEW.category_id, v_freq, 1,
        -- The flagged transaction IS the first occurrence: anchoring both
        -- starts_at and last_generated to it means the generators produce
        -- the NEXT occurrence and never back-generate a duplicate.
        NEW.transacted_at, NEW.transacted_at, true,
        NEW.direction, NEW.payment_method, NEW.note,
        NEW.amount_in_profile_currency, NEW.fx_rate_to_profile, NEW.fx_rate_date,
        EXTRACT(DAY FROM v_local)::smallint,
        EXTRACT(ISODOW FROM v_local)::smallint,
        v_local::time
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
    -- Does not list is_recurring in SET, so it cannot re-fire the
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

COMMIT;
