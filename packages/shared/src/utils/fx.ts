/**
 * FX rate lookup for write-time amount snapshotting (migration 011).
 *
 * Provider: frankfurter.app — free, no API key, ECB-sourced rates,
 * daily granularity. Documented at https://www.frankfurter.app/docs/.
 * We hit it with `?date=YYYY-MM-DD&from=EUR&to=USD` and pick the
 * single rate out of the response.
 *
 * Why client-side: each `createTransaction` already runs on the
 * device that has network access (and falls back to the offline sync
 * queue when not). Putting the FX lookup in the same hop avoids a
 * second round-trip and keeps the rate-resolution policy in one
 * place. The result is persisted with the transaction so neither
 * mobile nor the server has to re-look up later.
 *
 * Caching: in-memory only, scoped to the current process. We cache
 * (date, from, to) → rate because a single onboarding income +
 * recurring catch-up pass can ask for the same rate several times.
 * No persistence — a fresh process re-fetches.
 */

/**
 * The single canonical "what number do I sum?" accessor for any
 * aggregation across transactions. Reads the FX snapshot column —
 * `amount_in_profile_currency` — and returns 0 when the row hasn't
 * been backfilled yet so the sum stays coherent. Rows pending
 * backfill are effectively excluded, which is the right call: a
 * `€50 + $1000 = 1050` sum was the original bug. A `$1000 + (skipped
 * €50, will appear once converted)` sum is honest. UI surfaces that
 * care can count `null` rows separately and prompt the user.
 *
 * Pass through a structurally-typed param so this works for the
 * Supabase row shape, the local SQLite shape, and the export DTOs
 * without forcing a Transaction import everywhere.
 */
export function aggAmount(t: {
  amount_in_profile_currency?: number | null
}): number {
  return t.amount_in_profile_currency ?? 0
}

/**
 * True when a transaction is awaiting an FX snapshot (historical
 * foreign-currency row before backfill, or a write where the FX
 * provider was unreachable). Callers can count these to surface a
 * "N transactions pending conversion" hint.
 */
export function isFxPending(t: {
  amount_in_profile_currency?: number | null
}): boolean {
  return t.amount_in_profile_currency == null
}

const RATE_CACHE = new Map<string, number>()

function cacheKey(date: string, from: string, to: string): string {
  return `${date}|${from}|${to}`
}

export interface FxSnapshot {
  /** Rate such that `amount * rate = amount_in_profile_currency`. */
  rate: number
  /** ISO YYYY-MM-DD the rate is dated for. Always trimmed off any time
   *  component the caller passed in. */
  date: string
}

/**
 * Look up the conversion rate for a given date. `from === to` short-
 * circuits with rate=1 and never hits the network. Throws on network
 * failure or unexpected response shape so callers can decide whether
 * to fall back (e.g. mobile save path retries on next online).
 */
export async function fetchFxRate(
  isoDateOrTimestamp: string,
  from: string,
  to: string,
): Promise<FxSnapshot> {
  const date = isoDateOrTimestamp.slice(0, 10)
  if (from === to) return { rate: 1, date }

  const key = cacheKey(date, from, to)
  const cached = RATE_CACHE.get(key)
  if (cached != null) return { rate: cached, date }

  const url = `https://api.frankfurter.app/${date}?from=${encodeURIComponent(
    from,
  )}&to=${encodeURIComponent(to)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`FX lookup failed: HTTP ${res.status} for ${from}->${to} on ${date}`)
  }
  const body = (await res.json()) as { rates?: Record<string, number> }
  const rate = body?.rates?.[to]
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX lookup returned no rate for ${from}->${to} on ${date}`)
  }
  RATE_CACHE.set(key, rate)
  return { rate, date }
}

/**
 * Convenience wrapper for write-time snapshotting. Returns the three
 * columns to set on the row. Returns null when the lookup fails so
 * the caller can persist the row without the snapshot — the row will
 * be picked up by the backfill sweep later instead of blocking the
 * save.
 */
export async function snapshotFx(
  isoDateOrTimestamp: string,
  fromCurrency: string,
  toCurrency: string,
  amount: number,
): Promise<{
  amount_in_profile_currency: number
  fx_rate_to_profile: number
  fx_rate_date: string
} | null> {
  try {
    const { rate, date } = await fetchFxRate(isoDateOrTimestamp, fromCurrency, toCurrency)
    return {
      // Keep two decimals on the converted amount — matches the
      // numeric(14, 2) column type and avoids `0.1 + 0.2` noise when
      // the converted figure is later summed.
      amount_in_profile_currency: Math.round(amount * rate * 100) / 100,
      fx_rate_to_profile: rate,
      fx_rate_date: date,
    }
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[fx] snapshot failed:', err)
    return null
  }
}
