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

import { localDay } from './period'

/**
 * @deprecated Bare accessor with no pending-amount signal — this is
 * exactly the 07-F8/06-F34/05-F12 defect: a row awaiting FX backfill
 * silently contributes `0` and a caller has no way to know money went
 * missing from the total. Prefer `summarize()`
 * (`packages/shared/src/domain/money.ts`) for anything that reports a
 * total to a user, or `sumInProfileCurrency()` below for a flat sum
 * that still needs the pending count. Kept for the ~14 call sites
 * Stage 2 hasn't migrated yet.
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
 * "N transactions pending conversion" hint. Used internally by
 * `summarize()` in `packages/shared/src/domain/money.ts`, which is
 * this predicate's first real caller (07-F8: it had zero before).
 */
export function isFxPending(t: {
  amount_in_profile_currency?: number | null
}): boolean {
  return t.amount_in_profile_currency == null
}

/**
 * Sums `amount_in_profile_currency` across a flat list of
 * transactions — the direct, pending-aware replacement for a
 * hand-rolled `reduce((s, t) => s + aggAmount(t), 0)`. Accumulates in
 * integer cents so a long series can't drift off a rounding boundary
 * (05-F32), and never lets a null (FX-pending) row silently collapse
 * into the total: it's counted in `pendingCount` and excluded from
 * `total`, so a caller can render "N transactions awaiting
 * conversion" instead of a total that's quietly short.
 *
 * For anything richer than a flat total — income vs. expense,
 * transfers, a per-category breakdown — use `summarize()` in
 * `packages/shared/src/domain/money.ts` instead, which does this same
 * pending-aware accumulation per bucket.
 */
export function sumInProfileCurrency(
  txns: readonly { amount_in_profile_currency?: number | null }[],
): { total: number; pendingCount: number } {
  let cents = 0
  let pendingCount = 0
  for (const t of txns) {
    if (isFxPending(t)) {
      pendingCount++
      continue
    }
    cents += Math.round((t.amount_in_profile_currency as number) * 100)
  }
  return { total: cents / 100, pendingCount }
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
 *
 * `tz` (fix-plan 1.3 part 2 adoption): the rate should be dated to the
 * *civil* day the transaction belongs to in the user's zone, not
 * whatever UTC day a bare slice of the instant happens to land on — a
 * Chicago transaction at `2026-09-01T01:00:00Z` belongs to Aug 31
 * locally, so it should snapshot Aug 31's rate, not Sept 1's. Optional
 * and additive: omitting it keeps today's UTC-slice behaviour for the
 * call sites `eslint.config.mjs`'s `PERIOD_RESTRICTIONS` still marks as
 * Stage 2 debt, rather than breaking them with a newly-required param.
 */
export async function fetchFxRate(
  isoDateOrTimestamp: string,
  from: string,
  to: string,
  tz?: string,
): Promise<FxSnapshot> {
  const date = tz ? localDay(isoDateOrTimestamp, tz) : isoDateOrTimestamp.slice(0, 10)
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
 *
 * `tz`: see `fetchFxRate` — threaded straight through, same optional/
 * additive contract.
 */
export async function snapshotFx(
  isoDateOrTimestamp: string,
  fromCurrency: string,
  toCurrency: string,
  amount: number,
  tz?: string,
): Promise<{
  amount_in_profile_currency: number
  fx_rate_to_profile: number
  fx_rate_date: string
} | null> {
  try {
    const { rate, date } = await fetchFxRate(isoDateOrTimestamp, fromCurrency, toCurrency, tz)
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
