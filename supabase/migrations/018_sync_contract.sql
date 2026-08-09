-- Migration 018 — The outbox's server half (fix-plan 1.6, "An outbox that
-- can report failure, and an entity-complete offline layer").
--
-- Background. `createTransaction` has always returned `{ error: null }`
-- unconditionally: 'Not authenticated' was the only error it could ever
-- produce, so every `if (error)` at every call site was dead code, and a
-- write the server actually rejected was indistinguishable from one that
-- succeeded. The client-side rebuild (SyncManager/syncQueue) needs a
-- server write path that can express "only apply this if it's actually
-- newer" — something PostgREST's `.upsert()` cannot do, because it has no
-- way to attach a WHERE clause to the ON CONFLICT DO UPDATE branch. Hence
-- `sync_upsert_transaction` below.
--
-- Also here: `sync_operations.entity_type` has always listed `category`,
-- `budget` and `recurring_rule` alongside `transaction`, and the queue's
-- own `entity_type` column defaults the same way — but only `transaction`
-- ever had a matching sync contract on its table. This migration gives
-- the other three the same four columns transactions already carries for
-- sync (`client_id`, `version`, `is_deleted`, `synced_at`), so the mobile
-- outbox has a real server shape to write to once those entities' hooks
-- start enqueueing (a later item — this migration is the foundation).
--
-- `synced_at` moves from a plain nullable column to a server-stamped one
-- (DEFAULT now() on insert, a trigger on every update) on all four tables
-- — a device's own clock can never claim to know when the server actually
-- accepted a write.

BEGIN;

-- ============================================================
-- 1. transactions — rescope the sync dedup key
-- ============================================================
-- `client_id` was only ever unique per-database (a UUID collision across
-- two different users is not a real-world concern), but scoping it to
-- (user_id, client_id) is the correct invariant and is what
-- `sync_upsert_transaction` targets below — PostgREST's upsert already
-- named this column as its conflict target; this migration is what makes
-- that target a real named constraint the RPC can point ON CONFLICT at.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_client_id_unique;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_client_unique UNIQUE (user_id, client_id);

ALTER TABLE public.transactions ALTER COLUMN synced_at SET DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_synced_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.synced_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_transactions_synced_at ON public.transactions;
CREATE TRIGGER set_transactions_synced_at
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_synced_at();

-- ============================================================
-- 2. sync_upsert_transaction — the version-guarded write RPC
-- ============================================================
-- SECURITY INVOKER (the default — no clause needed): runs as the calling
-- user, so the existing "Users own their transactions" RLS policy applies
-- exactly as it would to a direct insert/update. The explicit user_id
-- check below is a fast, clear rejection rather than relying solely on
-- RLS to turn a cross-account attempt into a silent no-op.
--
-- `local_day` (migration 017) is NOT NULL with no default and mobile's
-- outbound payload does not send it yet (that adoption is a separate
-- item) — computed here from transacted_at + the owning profile's
-- timezone if the payload doesn't supply one, so this RPC never breaks
-- an insert on a column its caller doesn't know about yet.
CREATE OR REPLACE FUNCTION public.sync_upsert_transaction(payload jsonb)
RETURNS public.transactions
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row           public.transactions;
  v_user_id       uuid := (payload->>'user_id')::uuid;
  v_transacted_at timestamptz := (payload->>'transacted_at')::timestamptz;
  v_client_id     uuid := (payload->>'client_id')::uuid;
  v_local_day     date;
BEGIN
  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sync_upsert_transaction: user_id does not match the authenticated user'
      USING ERRCODE = '42501';
  END IF;

  v_local_day := COALESCE(
    (payload->>'local_day')::date,
    (v_transacted_at AT TIME ZONE COALESCE(
      (SELECT timezone FROM public.profiles WHERE id = v_user_id), 'UTC'
    ))::date
  );

  -- occurrence_date (migration 020, applied after this one — safe to
  -- reference here since a plpgsql body is only validated against the
  -- schema at call time, by which point 020 has already run) is the
  -- recurrence engine's resolved civil day, not derivable from this
  -- payload the way local_day is: pass it through when the caller
  -- supplies it and leave it NULL otherwise, exactly like migration 020
  -- itself expects from a writer that has not adopted the column yet.
  INSERT INTO public.transactions (
    id, user_id, amount, direction, currency_code, category_id, merchant,
    merchant_domain, note, payment_method, amount_in_profile_currency,
    fx_rate_to_profile, fx_rate_date, transacted_at, local_day,
    occurrence_date, source,
    ai_confidence, is_recurring, recurring_rule_id, recurring_frequency,
    client_id, client_created_at, version, is_deleted, deleted_at,
    created_at
  ) VALUES (
    COALESCE((payload->>'id')::uuid, uuid_generate_v4()),
    v_user_id,
    (payload->>'amount')::numeric,
    payload->>'direction',
    COALESCE(payload->>'currency_code', 'USD'),
    NULLIF(payload->>'category_id', '')::uuid,
    payload->>'merchant',
    payload->>'merchant_domain',
    payload->>'note',
    payload->>'payment_method',
    (payload->>'amount_in_profile_currency')::numeric,
    (payload->>'fx_rate_to_profile')::numeric,
    (payload->>'fx_rate_date')::date,
    v_transacted_at,
    v_local_day,
    (payload->>'occurrence_date')::date,
    payload->>'source',
    (payload->>'ai_confidence')::numeric,
    COALESCE((payload->>'is_recurring')::boolean, false),
    NULLIF(payload->>'recurring_rule_id', '')::uuid,
    payload->>'recurring_frequency',
    v_client_id,
    COALESCE((payload->>'client_created_at')::timestamptz, now()),
    COALESCE((payload->>'version')::integer, 1),
    COALESCE((payload->>'is_deleted')::boolean, false),
    (payload->>'deleted_at')::timestamptz,
    COALESCE((payload->>'created_at')::timestamptz, now())
  )
  ON CONFLICT (user_id, client_id) DO UPDATE SET
    amount                      = EXCLUDED.amount,
    direction                   = EXCLUDED.direction,
    currency_code               = EXCLUDED.currency_code,
    category_id                 = EXCLUDED.category_id,
    merchant                    = EXCLUDED.merchant,
    merchant_domain             = EXCLUDED.merchant_domain,
    note                        = EXCLUDED.note,
    payment_method              = EXCLUDED.payment_method,
    amount_in_profile_currency  = EXCLUDED.amount_in_profile_currency,
    fx_rate_to_profile          = EXCLUDED.fx_rate_to_profile,
    fx_rate_date                = EXCLUDED.fx_rate_date,
    transacted_at               = EXCLUDED.transacted_at,
    local_day                   = EXCLUDED.local_day,
    occurrence_date             = EXCLUDED.occurrence_date,
    source                      = EXCLUDED.source,
    ai_confidence               = EXCLUDED.ai_confidence,
    is_recurring                = EXCLUDED.is_recurring,
    recurring_rule_id           = EXCLUDED.recurring_rule_id,
    recurring_frequency         = EXCLUDED.recurring_frequency,
    version                     = EXCLUDED.version,
    is_deleted                  = EXCLUDED.is_deleted,
    deleted_at                  = EXCLUDED.deleted_at
  WHERE EXCLUDED.version > public.transactions.version
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- The WHERE guard rejected a stale write (a losing race) — return the
    -- current winning row so the caller can detect the loss and re-pull
    -- instead of silently believing its stale write landed.
    SELECT * INTO v_row
    FROM public.transactions
    WHERE user_id = v_user_id AND client_id = v_client_id;
  END IF;

  INSERT INTO public.sync_operations (
    user_id, client_id, operation, entity_type, entity_id, payload, client_timestamp
  ) VALUES (
    v_user_id,
    v_client_id,
    CASE WHEN COALESCE((payload->>'version')::integer, 1) > 1 THEN 'update' ELSE 'create' END,
    'transaction',
    v_row.id,
    payload,
    COALESCE((payload->>'client_created_at')::timestamptz, now())
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_upsert_transaction(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_upsert_transaction(jsonb) TO authenticated;

-- ============================================================
-- 3. categories / budgets / recurring_rules — the same sync contract
-- ============================================================
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS client_id  uuid,
  ADD COLUMN IF NOT EXISTS version    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at  timestamptz;
UPDATE public.categories SET client_id = id WHERE client_id IS NULL;
ALTER TABLE public.categories ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_user_client_unique,
  ADD CONSTRAINT categories_user_client_unique UNIQUE (user_id, client_id);
DROP TRIGGER IF EXISTS set_categories_synced_at ON public.categories;
CREATE TRIGGER set_categories_synced_at
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_synced_at();

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS client_id  uuid,
  ADD COLUMN IF NOT EXISTS version    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at  timestamptz;
UPDATE public.budgets SET client_id = id WHERE client_id IS NULL;
ALTER TABLE public.budgets ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE public.budgets ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_user_client_unique,
  ADD CONSTRAINT budgets_user_client_unique UNIQUE (user_id, client_id);
DROP TRIGGER IF EXISTS set_budgets_synced_at ON public.budgets;
CREATE TRIGGER set_budgets_synced_at
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_synced_at();

-- recurring_rules never had an updated_at column at all — every other
-- table in 001_initial_schema.sql does. Added here alongside the sync
-- contract rather than as its own migration since nothing needed it until
-- this item gave recurring_rules a client write path to guard with it.
ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS set_recurring_rules_updated_at ON public.recurring_rules;
CREATE TRIGGER set_recurring_rules_updated_at
  BEFORE UPDATE ON public.recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS client_id  uuid,
  ADD COLUMN IF NOT EXISTS version    integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS synced_at  timestamptz;
UPDATE public.recurring_rules SET client_id = id WHERE client_id IS NULL;
ALTER TABLE public.recurring_rules ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE public.recurring_rules ALTER COLUMN synced_at SET DEFAULT now();
ALTER TABLE public.recurring_rules
  DROP CONSTRAINT IF EXISTS recurring_rules_user_client_unique,
  ADD CONSTRAINT recurring_rules_user_client_unique UNIQUE (user_id, client_id);
DROP TRIGGER IF EXISTS set_recurring_rules_synced_at ON public.recurring_rules;
CREATE TRIGGER set_recurring_rules_synced_at
  BEFORE INSERT OR UPDATE ON public.recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_synced_at();

-- Trigger-only function, same pattern migration 016 applied to the other
-- trigger functions: never invoked directly over /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.set_synced_at() FROM anon, authenticated, public;

COMMIT;
