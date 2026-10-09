-- 041: Murmur learns from corrections (Oct 2026).
--
-- When someone moves a transaction to a different category, Murmur
-- remembers "this merchant goes in that category" and files the next
-- capture from that merchant there, before the AI's guess. This is the
-- rules engine of a bank-sync budgeting app without asking anyone to
-- write a rule.
--
-- `merchant_key` is the merchant reduced to letters and digits, after the
-- shared descriptor cleaner (packages/shared/src/domain/merchantRules.ts),
-- so "STARBUCKS #04412", "Starbucks" and "SQ *STARBUCKS" are one rule.
--
-- Additive only: nothing reads this table until the app version that
-- writes it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.merchant_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_key  text NOT NULL CHECK (length(merchant_key) BETWEEN 1 AND 120),
  -- How the merchant reads to the person ("Starbucks"), for the list in
  -- Settings where a rule can be removed.
  merchant_name text NOT NULL CHECK (length(merchant_name) BETWEEN 1 AND 200),
  -- Deleting the category deletes the rule: there is nowhere left to file.
  category_id   uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, merchant_key)
);

DROP TRIGGER IF EXISTS merchant_rules_updated_at ON public.merchant_rules;
CREATE TRIGGER merchant_rules_updated_at
  BEFORE UPDATE ON public.merchant_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.merchant_rules ENABLE ROW LEVEL SECURITY;

-- Own rows only, and only pointing at one's own categories.
DROP POLICY IF EXISTS merchant_rules_own ON public.merchant_rules;
CREATE POLICY merchant_rules_own ON public.merchant_rules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = category_id AND c.user_id = auth.uid()
    )
  );

COMMIT;
