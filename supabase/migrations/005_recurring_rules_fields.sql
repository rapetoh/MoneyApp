-- Add direction, payment_method, and note to recurring_rules.
-- These are needed to generate new transactions from a rule without always needing the template transaction.

ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS direction      text NOT NULL DEFAULT 'debit'
    CHECK (direction IN ('debit', 'credit')),
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IN ('cash','credit_card','debit_card','digital_wallet','bank_transfer','other')),
  ADD COLUMN IF NOT EXISTS note           text;
