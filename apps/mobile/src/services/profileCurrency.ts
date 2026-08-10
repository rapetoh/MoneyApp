/**
 * In-memory cache of the current user's profile currency.
 *
 * `createTransaction` and the recurring catch-up service both need
 * `profile.currency_code` to compute the FX snapshot at save time
 * (migration 011). Threading it through every call site (voice flow,
 * manual flow, scan flow, onboarding, edit screen, catch-up) would
 * mean six prop drills and a wider hook surface; instead we cache it
 * here and let `useProfile` push updates whenever the row changes.
 *
 * Lifecycle:
 *   - `useProfile` calls `setCurrentProfileCurrency` on every load
 *     and on every update.
 *   - Write paths read via `getCurrentProfileCurrency`. The default
 *     is 'USD' (matches the profile column default), so an early
 *     write before the profile loads still gets a sensible value.
 *   - Signing out resets to 'USD' via `resetLocalState` in
 *     `src/hooks/useAuth.ts`.
 *
 * `changeCurrency` below is the currency-*change* flow (fix-plan 2.7,
 * audit 05-F13/06-F8/08-F5) — a different thing from the cache above,
 * kept in this file because it's the module already responsible for
 * "what currency is this profile in" and the operation ends by updating
 * exactly that.
 */

import { supabase } from '../lib/supabase'
import { syncManager } from './sync/SyncManager'

let cached: string = 'USD'

export function setCurrentProfileCurrency(code: string | null | undefined): void {
  if (code && typeof code === 'string') cached = code
}

export function getCurrentProfileCurrency(): string {
  return cached
}

/** Progress callback shape for `changeCurrency` — cumulative transactions
 *  converted so far vs. the total the server reported needing
 *  conversion, so a caller can render "Converting 240 of 1,400
 *  transactions…". */
export interface CurrencyChangeProgress {
  converted: number
  total: number
}

export type CurrencyChangeResult = { ok: true } | { ok: false; error: string }

/** Response shape from the `change-currency` edge function. Not the
 *  generated `Database` type — Edge Function invocations aren't part of
 *  that surface — so this is asserted rather than inferred, same as
 *  every other `supabase.functions.invoke` call site in this app. */
interface ChangeCurrencyResponse {
  ok: boolean
  done: boolean
  converted: number
  remaining: number
  total: number
  alreadyCurrent?: boolean
  error?: string
}

// Bounded so a server bug (or a permanently-failing FX provider) can't
// spin the caller forever. The edge function converts up to 200
// transactions per call (its own BATCH_SIZE) — 200 calls covers 40,000
// transactions, comfortably past any real account, and each failed call
// already returns a real error well before this cap is reached.
const MAX_CHANGE_CURRENCY_CALLS = 200

/**
 * Re-denominates the signed-in user's entire transaction history,
 * budgets and monthly income into `newCurrency`, then flips
 * `profiles.currency_code` — never before (fix-plan 2.7: "a currency
 * change becomes a server-side, batched, resumable re-denomination").
 * Calls `supabase/functions/change-currency` in a loop, one batch per
 * call, until the server reports `done: true`; `onProgress` fires after
 * every batch so a caller can render a blocking progress UI.
 *
 * Refuses outright while offline — a half-converted account showing
 * wrong money is worse than making the user wait for connectivity — and
 * on any failure returns `{ ok: false }` without ever having written
 * `profiles.currency_code` (the edge function only writes it on the
 * batch that finds nothing left to convert, so an error on any earlier
 * batch necessarily leaves the profile on its old currency).
 */
export async function changeCurrency(
  newCurrency: string,
  onProgress?: (progress: CurrencyChangeProgress) => void,
): Promise<CurrencyChangeResult> {
  if (!syncManager.online) {
    return { ok: false, error: 'offline' }
  }

  let convertedSoFar = 0

  for (let i = 0; i < MAX_CHANGE_CURRENCY_CALLS; i++) {
    const { data, error } = await supabase.functions.invoke('change-currency', {
      body: { newCurrency },
    })
    if (error) {
      return { ok: false, error: error.message ?? 'Currency change request failed' }
    }
    const result = data as ChangeCurrencyResponse
    if (!result?.ok) {
      return { ok: false, error: result?.error ?? 'Currency change failed' }
    }

    convertedSoFar += result.converted
    onProgress?.({ converted: convertedSoFar, total: result.total })

    if (result.done) {
      // The server already committed `profiles.currency_code` — keep
      // the write-path cache (used by `createTransaction`/`fxBackfill`
      // for the *next* save, not by this operation) in step with it
      // immediately, rather than waiting for the next `useProfile`
      // reload.
      setCurrentProfileCurrency(newCurrency)
      return { ok: true }
    }
  }

  return { ok: false, error: 'Currency change did not finish — please try again' }
}
