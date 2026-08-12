-- Migration 030 — sync_upsert_transaction could not mint a fallback id.
--
-- The function body (migration 018) calls uuid_generate_v4() while pinning
-- SET search_path = public, pg_temp. On Supabase the uuid-ossp extension
-- lives in the `extensions` schema, so the very first real execution of
-- this RPC failed with `function uuid_generate_v4() does not exist`,
-- dead-lettering every transaction create from the mobile outbox
-- (surfaced 2026-08-11 in TestFlight build 8 as "1 item couldn't sync").
-- The 001 table DEFAULTs kept working because defaults resolve against the
-- session search_path at DDL time — only this pinned-path function body
-- was blind.
--
-- Fix: gen_random_uuid(), which is built into Postgres core (pg_catalog)
-- since PG13 and resolvable under any search_path. This COALESCE arm is a
-- fallback only — the mobile client always supplies its own id.
--
-- Applied to production 2026-08-11 via MCP (name:
-- fix_sync_upsert_uuid_resolution); this file mirrors it for the repo's
-- schema history.

BEGIN;

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

COMMIT;
