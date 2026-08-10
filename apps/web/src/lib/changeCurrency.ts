/**
 * Web's twin of `apps/mobile/src/services/profileCurrency.ts`'s
 * `changeCurrency` — fix-plan 2.7 ("Currency change as a migration, not
 * a label swap", audit 05-F13/06-F8/08-F5) and its own web-parity gap
 * (the settings page here used to just write `currency_code` directly,
 * a bare label swap that left every historical `amount_in_profile_currency`
 * at its old magnitude under a new symbol — never calling the
 * `change-currency` Edge Function mobile already routes through).
 *
 * Same contract as mobile: calls `supabase/functions/change-currency`
 * in a loop, one batch per call, until the server reports `done: true`;
 * `onProgress` fires after every batch so a caller can render a
 * blocking "Converting N of M transactions…" state. Refuses outright
 * while offline — a half-converted account showing wrong money is
 * worse than making the user wait for connectivity — and on any
 * failure returns `{ ok: false }` without ever having written
 * `profiles.currency_code` (the Edge Function only writes it on the
 * batch that finds nothing left to convert).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CurrencyChangeProgress {
  converted: number
  total: number
}

export type CurrencyChangeResult = { ok: true } | { ok: false; error: string }

/** Response shape from the `change-currency` Edge Function. Asserted
 *  rather than inferred — Edge Function invocations aren't part of the
 *  generated `Database` type — same as the mobile call site. */
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
// spin the caller forever — matches mobile's own cap and the Edge
// Function's 200-row BATCH_SIZE (200 calls covers 40,000 transactions).
const MAX_CHANGE_CURRENCY_CALLS = 200

export async function changeCurrency(
  supabase: SupabaseClient,
  newCurrency: string,
  onProgress?: (progress: CurrencyChangeProgress) => void,
): Promise<CurrencyChangeResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
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

    if (result.done) return { ok: true }
  }

  return { ok: false, error: 'Currency change did not finish — please try again' }
}
