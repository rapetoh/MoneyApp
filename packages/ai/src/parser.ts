import type { ParsedExpense, Locale, ParseFieldError } from '@voice-expense/shared'
import { assertParsedExpense, ParseValidationError } from './validateParsedExpense'

export interface ParseOptions {
  transcript: string
  locale: Locale
  currency: string
  categories: string[]
  apiBaseUrl: string
  authToken: string
  /** The signed-in user's id. Part of the cache key (see `cacheKey` below)
   *  — without it, a second user on the same device could be served the
   *  first user's cached parse (audit 02-F24). Optional only so
   *  call sites mid-migration don't hard-fail; omitting it means the
   *  cache is effectively unscoped, which `clearParseCache` on sign-out
   *  still protects against for any single-session leak. */
  userId?: string
  /** The caller's civil date (`YYYY-MM-DD`) in the *user's* timezone.
   *  Without it the API route derives "today" from the server's UTC
   *  clock, which after ~7 PM in the Americas is already tomorrow — so
   *  "I spent $6 today" parsed to tomorrow's date (TestFlight build 8,
   *  2026-08-11). Optional for backward compatibility: older clients
   *  keep the UTC fallback. */
  todayCivilDate?: string
}

// Simple in-memory LRU cache
const cache = new Map<string, { result: ParsedExpense; ts: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CACHE_MAX = 500

/** Included in the cache key so a cached result changes about once a day —
 *  `transacted_at` defaults to "today" server-side (prompt.ts), so a
 *  literal cache hit for the same transcript a day later would replay
 *  yesterday's date. An epoch-day bucket, not a calendar-day string: this
 *  is a cache-staleness bucket, not a user-facing date, so it doesn't need
 *  (and must not pretend to have) the caller's timezone the way anything
 *  in packages/shared/src/utils/period.ts does. */
function epochDayBucket(): number {
  return Math.floor(Date.now() / 86_400_000)
}

/** Cache key includes `userId`, the sorted category list, and the day
 *  bucket — before this item the key was `locale:currency:transcript`,
 *  which omitted all three (audit 02-F24: "serving stale suggestions").
 *  A second user on the same device, a category added since the last
 *  parse, or the same phrase parsed a day later must never share a cache
 *  entry with the first. */
function cacheKey(opts: Pick<ParseOptions, 'transcript' | 'locale' | 'currency' | 'categories' | 'userId' | 'todayCivilDate'>): string {
  const sortedCategories = [...opts.categories].sort().join(',')
  // The user's civil date participates too: when it's supplied it drives
  // the prompt's "today", so two parses across the user's own midnight
  // must not share an entry even inside one epoch-day bucket.
  return `${opts.userId ?? ''}:${opts.locale}:${opts.currency}:${sortedCategories}:${epochDayBucket()}:${opts.todayCivilDate ?? ''}:${opts.transcript.toLowerCase().trim()}`
}

/** Sign-out teardown (fix-plan item 1.7 / audit 02-F24's second half): a
 *  module-level `Map` outlives `resetLocalState`'s per-user cleanup unless
 *  something clears it explicitly. Called from
 *  `apps/mobile/src/hooks/useAuth.ts`'s `resetLocalState`. */
export function clearParseCache(): void {
  cache.clear()
}

function getCached(key: string): ParsedExpense | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.result
}

function setCached(key: string, result: ParsedExpense): void {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest
    const firstKey = cache.keys().next().value
    if (firstKey) cache.delete(firstKey)
  }
  cache.set(key, { result, ts: Date.now() })
}

export async function parseExpense(opts: ParseOptions): Promise<ParsedExpense> {
  // Tier 1: cache check
  const key = cacheKey(opts)
  const cached = getCached(key)
  if (cached) return cached

  // Tier 2: AI call via Next.js API route
  const response = await fetch(`${opts.apiBaseUrl}/api/ai/parse-expense`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.authToken}`,
    },
    body: JSON.stringify({
      transcript: opts.transcript,
      locale: opts.locale,
      currency: opts.currency,
      categories: opts.categories,
      todayCivilDate: opts.todayCivilDate,
    }),
  })

  if (!response.ok) {
    if (response.status === 422) {
      // The route already ran this same response through
      // `validateParsedExpense` and rejected it — carry the field errors
      // through as a typed throw rather than re-deriving them or falling
      // back to a defaulted save.
      let body: { errors?: ParseFieldError[] } = {}
      try {
        body = (await response.json()) as { errors?: ParseFieldError[] }
      } catch {
        // Malformed error body — fall through with an empty error list.
      }
      throw new ParseValidationError(body.errors ?? [])
    }
    throw new Error(`AI parse failed: ${response.status}`)
  }

  const raw: unknown = await response.json()
  // Second boundary (route already validated once): never trust a model
  // response into a save path unchecked, even one the route already
  // approved — a version-skewed or bypassed route must not become a
  // defaulted local write. Throws ParseValidationError on any invalid
  // field; never coerces one.
  const result = assertParsedExpense(raw)
  setCached(key, result)
  return result
}
