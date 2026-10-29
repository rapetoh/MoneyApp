-- 044: Businesses (Oct 27 2026).
--
-- A person with side businesses (a farm rental, a store booth, books) keeps
-- each one's money apart from their personal spending, so their CPA gets one
-- clean file per business. A business is a second label on a transaction,
-- next to its category: "Walmart, Cleaning, Farm". No business = Personal.
--
-- Older app versions never send `business_id`: the sync function leaves the
-- stored value alone unless the payload carries the key, so a phone on
-- 1.0.1 editing a row cannot wipe a business set on the web. Every change
-- below that moves rows bumps `version` (and `updated_at`), so phones pull
-- the new value instead of keeping a stale copy.

BEGIN;

CREATE TABLE IF NOT EXISTS public.businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_name_uq
  ON public.businesses (user_id, lower(btrim(name)));

DROP TRIGGER IF EXISTS businesses_updated_at ON public.businesses;
CREATE TRIGGER businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS businesses_own ON public.businesses;
CREATE POLICY businesses_own ON public.businesses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_user_business_idx
  ON public.transactions (user_id, business_id) WHERE business_id IS NOT NULL;

-- Migration 030's function plus `business_id`. A business id that is not one
-- of this person's (deleted while a phone was offline, or never theirs)
-- resolves to NULL instead of failing the write, so an outbox entry can
-- never dead-letter on it.
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
  v_business_id   uuid;
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

  SELECT b.id INTO v_business_id
  FROM public.businesses b
  WHERE b.id = NULLIF(payload->>'business_id', '')::uuid AND b.user_id = v_user_id;

  INSERT INTO public.transactions (
    id, user_id, amount, direction, currency_code, category_id, merchant,
    merchant_domain, note, payment_method, amount_in_profile_currency,
    fx_rate_to_profile, fx_rate_date, transacted_at, local_day,
    occurrence_date, source,
    ai_confidence, is_recurring, recurring_rule_id, recurring_frequency,
    business_id,
    client_id, client_created_at, version, is_deleted, deleted_at,
    created_at
  ) VALUES (
    COALESCE((payload->>'id')::uuid, gen_random_uuid()),
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
    v_business_id,
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
    -- Only a writer that knows about businesses may change the label.
    business_id                 = CASE WHEN payload ? 'business_id'
                                       THEN EXCLUDED.business_id
                                       ELSE public.transactions.business_id END,
    version                     = EXCLUDED.version,
    is_deleted                  = EXCLUDED.is_deleted,
    deleted_at                  = EXCLUDED.deleted_at
  WHERE EXCLUDED.version > public.transactions.version
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
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

-- Move many transactions to a business (NULL = Personal) in one call, e.g.
-- a year of imported statement lines. Returns how many rows changed.
CREATE OR REPLACE FUNCTION public.set_transactions_business(p_ids uuid[], p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_business_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'set_transactions_business: unknown business' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(array_length(p_ids, 1), 0) > 5000 THEN
    RAISE EXCEPTION 'set_transactions_business: at most 5000 rows per call' USING ERRCODE = '22023';
  END IF;

  UPDATE public.transactions
  SET business_id = p_business_id,
      version = version + 1,
      updated_at = now()
  WHERE user_id = auth.uid()
    AND id = ANY (p_ids)
    AND NOT is_deleted
    AND business_id IS DISTINCT FROM p_business_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Delete a business: its transactions go back to Personal first (with a
-- version bump, so phones see it), then the business row goes.
CREATE OR REPLACE FUNCTION public.delete_business(p_business_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.transactions
  SET business_id = NULL,
      version = version + 1,
      updated_at = now()
  WHERE user_id = auth.uid() AND business_id = p_business_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.businesses WHERE id = p_business_id AND user_id = auth.uid();
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_transactions_business(uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_business(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_transactions_business(uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_business(uuid) TO authenticated;

COMMIT;
