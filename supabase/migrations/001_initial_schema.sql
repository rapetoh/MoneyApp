-- ============================================================
-- Voice Expense Tracker — Initial Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text,
  currency_code   text NOT NULL DEFAULT 'USD',
  locale          text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fr', 'es', 'pt')),
  voice_language  text NOT NULL DEFAULT 'en-US',
  timezone        text NOT NULL DEFAULT 'UTC',
  monthly_income  numeric(12, 2),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  name_normalized text NOT NULL,
  color           text,
  icon            text,
  parent_id       uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_archived     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name_normalized)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their categories"
  ON public.categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_categories_user ON public.categories(user_id);

-- ============================================================
-- RECURRING RULES
-- ============================================================
CREATE TABLE public.recurring_rules (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_txn_id uuid,
  name            text,
  amount          numeric(12, 2) NOT NULL,
  currency_code   text NOT NULL DEFAULT 'USD',
  category_id     uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  frequency       text NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','monthly','quarterly','yearly')),
  interval        integer NOT NULL DEFAULT 1,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  last_generated  timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their recurring rules"
  ON public.recurring_rules FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_recurring_rules_user ON public.recurring_rules(user_id);

-- ============================================================
-- TRANSACTIONS (core table)
-- ============================================================
CREATE TABLE public.transactions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount            numeric(12, 2) NOT NULL CHECK (amount > 0),
  direction         text NOT NULL CHECK (direction IN ('debit', 'credit')),
  currency_code     text NOT NULL DEFAULT 'USD',
  category_id       uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  merchant          text,
  merchant_domain   text,
  note              text,
  payment_method    text CHECK (payment_method IN (
                      'cash', 'credit_card', 'debit_card',
                      'digital_wallet', 'bank_transfer', 'other'
                    )),
  transacted_at     timestamptz NOT NULL,
  source            text NOT NULL CHECK (source IN (
                      'voice', 'manual', 'scan', 'shortcut',
                      'notification_listener', 'recurring_generated'
                    )),
  raw_transcript    text,
  ai_confidence     numeric(3, 2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1),
  is_recurring      boolean NOT NULL DEFAULT false,
  recurring_rule_id uuid REFERENCES public.recurring_rules(id) ON DELETE SET NULL,
  -- Sync fields
  client_id         uuid NOT NULL,
  client_created_at timestamptz NOT NULL,
  version           integer NOT NULL DEFAULT 1,
  is_deleted        boolean NOT NULL DEFAULT false,
  deleted_at        timestamptz,
  synced_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their transactions"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_transactions_user_date ON public.transactions(user_id, transacted_at DESC);
CREATE INDEX idx_transactions_user_category ON public.transactions(user_id, category_id);
CREATE INDEX idx_transactions_user_deleted ON public.transactions(user_id, is_deleted);
CREATE INDEX idx_transactions_client ON public.transactions(user_id, client_id);

-- Add foreign key for template_txn_id after transactions table exists
ALTER TABLE public.recurring_rules
  ADD CONSTRAINT fk_template_txn
  FOREIGN KEY (template_txn_id) REFERENCES public.transactions(id) ON DELETE SET NULL;

-- ============================================================
-- BUDGETS
-- ============================================================
CREATE TABLE public.budgets (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  amount          numeric(12, 2) NOT NULL CHECK (amount > 0),
  period          text NOT NULL CHECK (period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  currency_code   text NOT NULL DEFAULT 'USD',
  starts_at       date NOT NULL DEFAULT CURRENT_DATE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their budgets"
  ON public.budgets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_budgets_user ON public.budgets(user_id);

-- ============================================================
-- DEVICES
-- ============================================================
CREATE TABLE public.devices (
  id              uuid PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('ios', 'android', 'web', 'desktop_mac', 'desktop_win')),
  device_name     text,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_synced_at  timestamptz
);

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their devices"
  ON public.devices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SYNC OPERATIONS (conflict audit log)
-- ============================================================
CREATE TABLE public.sync_operations (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id           uuid NOT NULL,
  operation           text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  entity_type         text NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget', 'recurring_rule')),
  entity_id           uuid NOT NULL,
  payload             jsonb NOT NULL,
  client_timestamp    timestamptz NOT NULL,
  server_timestamp    timestamptz NOT NULL DEFAULT now(),
  is_conflict         boolean NOT NULL DEFAULT false,
  conflict_resolution text CHECK (conflict_resolution IN ('last_write_wins', 'kept_server', 'kept_client', 'merged'))
);

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sync operations"
  ON public.sync_operations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert sync operations"
  ON public.sync_operations FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_sync_ops_user_entity ON public.sync_operations(user_id, entity_id, client_timestamp DESC);

-- ============================================================
-- AI USAGE LOG (internal cost monitoring — no RLS, service role only)
-- ============================================================
CREATE TABLE public.ai_usage_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id_hashed  text NOT NULL,
  model           text NOT NULL,
  input_tokens    integer NOT NULL DEFAULT 0,
  output_tokens   integer NOT NULL DEFAULT 0,
  cost_usd_est    numeric(8, 6) NOT NULL DEFAULT 0,
  cache_hit       boolean NOT NULL DEFAULT false,
  call_type       text NOT NULL CHECK (call_type IN ('parse', 'scan', 'advisor')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- No RLS — only accessible via service role
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct user access to AI logs"
  ON public.ai_usage_log FOR ALL
  USING (false);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update updated_at on all tables)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
