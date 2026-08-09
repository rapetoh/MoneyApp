-- Migration 014 — Idempotent relink in link_or_create_recurring_rule.
--
-- Hole found in adversarial review of 013: a stale offline client payload
-- can upsert a transaction row with recurring_rule_id = NULL after the
-- trigger already linked it (full-row upsert echoes the client's pre-link
-- snapshot). The trigger then re-fires, and for a NULL-merchant transaction
-- the name-based lookup finds nothing — minting a second, orphaned rule.
--
-- Fix: before any name matching, look for the rule this very transaction
-- already templates (template_txn_id = NEW.id). Re-firing now always
-- relinks the same rule, for named and unnamed merchants alike.

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
    BEGIN
      INSERT INTO public.recurring_rules (
        user_id, template_txn_id, name, amount, currency_code, category_id,
        frequency, interval, starts_at, last_generated, is_active,
        direction, payment_method, note
      ) VALUES (
        NEW.user_id, NEW.id, NEW.merchant, NEW.amount, NEW.currency_code,
        NEW.category_id, v_freq, 1,
        -- The flagged transaction IS the first occurrence: anchoring both
        -- starts_at and last_generated to it means the generators produce
        -- the NEXT occurrence and never back-generate a duplicate.
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
