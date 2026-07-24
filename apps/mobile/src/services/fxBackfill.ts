/**
 * One-shot FX backfill for foreign-currency historical transactions
 * (migration 011).
 *
 * Migration 011 added `amount_in_profile_currency` and friends. The
 * SQL migration backfilled the trivial case — rows whose
 * `currency_code` already matches the user's profile currency, rate
 * = 1. Foreign-currency historical rows stay NULL until this function
 * fills them in. Aggregations exclude NULL rows (via `aggAmount`),
 * so until this runs, foreign txns are quietly missing from totals.
 *
 * Strategy. On app launch (after sync settles) we query the partial
 * index `idx_txn_needs_fx_backfill` for the user's NULL rows, look
 * up the historical rate per (date, currency) via frankfurter.app,
 * and write the snapshot back. We cap at FX_BACKFILL_BATCH per
 * launch so a user with a long international history is converted
 * across several app opens rather than blocking one launch with
 * thousands of rate fetches. The frankfurter cache in
 * `snapshotFx` keeps a single batch's network footprint small.
 *
 * Idempotent. The WHERE clause excludes already-filled rows, so
 * re-running is a no-op. Safe to invoke alongside `runRecurringCatchUp`.
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
    .is('amount_in_profile_currency', null)
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
      })
      .eq('id', row.id)
    if (!writeError) filled++
  }

  return filled
}
