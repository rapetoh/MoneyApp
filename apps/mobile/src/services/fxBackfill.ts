/**
 * One-shot FX backfill for foreign-currency historical transactions
 * (migration 011), self-healing after a currency change (migration 026,
 * fix-plan 2.7).
 *
 * Migration 011 added `amount_in_profile_currency` and friends. The
 * SQL migration backfilled the trivial case — rows whose
 * `currency_code` already matches the user's profile currency, rate
 * = 1. Foreign-currency historical rows stay NULL until this function
 * fills them in. Aggregations exclude NULL rows (via `aggAmount`),
 * so until this runs, foreign txns are quietly missing from totals.
 *
 * Strategy. On app launch (after sync settles) we query for the
 * user's rows that still need a snapshot and look up the historical
 * rate per (date, currency) via frankfurter.app, and write the
 * snapshot back. We cap at FX_BACKFILL_BATCH per launch so a user
 * with a long international history is converted across several app
 * opens rather than blocking one launch with thousands of rate
 * fetches. The frankfurter cache in `snapshotFx` keeps a single
 * batch's network footprint small.
 *
 * "Still needs a snapshot" (fix-plan 2.7, audit 05-F13/06-F8/08-F5)
 * covers two cases, not one: `amount_in_profile_currency IS NULL`
 * (never filled — migration 011's original case), OR
 * `snapshot_currency <> profileCurrency` (filled, but for a currency
 * the profile no longer uses — the `change-currency` edge function
 * updates transactions in its own batches and only flips
 * `profiles.currency_code` once every row is done, so an
 * interrupted currency change leaves rows in this second state,
 * which this same sweep picks up and finishes rather than needing a
 * dedicated recovery path). `snapshot_currency` (migration 026)
 * records which currency a filled snapshot actually targets — before
 * it existed, a currency change had no way to tell "already correct"
 * apart from "correct for a currency we no longer use", so a bare
 * `profiles.currency_code` write left every historical figure with
 * the right magnitude and the wrong label forever.
 *
 * Idempotent. The predicate excludes rows already correct for the
 * current profile currency, so re-running is a no-op. Safe to invoke
 * alongside `runRecurringCatchUp`.
 */

import { supabase } from '../lib/supabase'
import { snapshotFx } from '@voice-expense/shared'
import { getCurrentProfileCurrency } from './profileCurrency'

const FX_BACKFILL_BATCH = 100

export async function runFxBackfill(userId: string): Promise<number> {
  const profileCurrency = getCurrentProfileCurrency()

  const { data, error } = await supabase
    .from('transactions')
    .select('id, amount, currency_code, transacted_at')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    // `.neq` never matches a NULL `snapshot_currency`, which is exactly
    // why this is an `.or()` rather than a single compound filter — see
    // the module doc comment above for the two cases this covers.
    .or(`amount_in_profile_currency.is.null,snapshot_currency.neq.${profileCurrency}`)
    .order('transacted_at', { ascending: false })
    .limit(FX_BACKFILL_BATCH)

  if (error || !data?.length) return 0

  let filled = 0
  for (const row of data as Array<{
    id: string
    amount: number
    currency_code: string
    transacted_at: string
  }>) {
    const fx = await snapshotFx(
      row.transacted_at,
      row.currency_code,
      profileCurrency,
      row.amount,
    )
    if (!fx) continue
    const { error: writeError } = await supabase
      .from('transactions')
      .update({
        amount_in_profile_currency: fx.amount_in_profile_currency,
        fx_rate_to_profile: fx.fx_rate_to_profile,
        fx_rate_date: fx.fx_rate_date,
        // Records which currency this snapshot targets (migration 026)
        // so a later currency change — or an interrupted one — can tell
        // "already correct" apart from "correct for a currency we no
        // longer use" instead of trusting a filled `amount_in_profile_currency`
        // at face value.
        snapshot_currency: profileCurrency,
      })
      .eq('id', row.id)
    if (!writeError) filled++
  }

  return filled
}
