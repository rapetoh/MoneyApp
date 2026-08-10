import { getCalendars } from 'expo-localization'
import { addDays, civilDateTimeToInstant, localParts } from '@voice-expense/shared'
import type {
  AskMurmurRequest,
  AskMurmurResponse,
  AskMurmurTransaction,
  AskMurmurRecurringRule,
  Locale,
} from '@voice-expense/shared'
import type { Transaction } from '@voice-expense/shared'
import type { RecurringRule } from '@voice-expense/shared'
import type { Category } from '@voice-expense/shared'

// Server-side caps. Mirror these client-side so the request stays predictable.
const MAX_TRANSACTIONS = 500
const WINDOW_DAYS = 90

/** IANA zone the device is currently in — same lookup `useProfile.ts`
 *  uses to capture `profiles.timezone`. Falls back to `'UTC'` on a
 *  platform/runtime that can't answer, same contract as every other
 *  zone-resolution call site in the app (fix-plan 1.3). */
function deviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

interface BuildArgs {
  question: string
  locale: Locale
  currency: string
  monthly_income: number | null
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  categories: Category[]
  /** The user's own zone — pass `profile.timezone` when the caller has
   *  it loaded. Falls back to the device's current zone otherwise, never
   *  to the reading process's zone (fix-plan 2.10). */
  timeZone?: string
}

/** Trim local stores into the wire shape the reasoner expects. Keep only the
 *  last 90 days of non-deleted transactions, drop oldest first if we still
 *  exceed the 500-row cap. */
export function buildAskMurmurRequest(args: BuildArgs): AskMurmurRequest {
  const tz = args.timeZone || deviceTimeZone()
  const nowIso = new Date().toISOString()
  // fix-plan 1.3 — period.ts doesn't export a canned "N days ago" bound,
  // so this composes one from the exported day-arithmetic primitives
  // rather than `Date#setDate`/`Date#getDate` (audit 04-F4's class of
  // defect — a rolling window computed in whatever zone the *device*
  // happens to render in rather than resolved through `period.ts`),
  // mirroring apps/web/src/app/dashboard/ask/page.tsx's `daysAgoInstant`.
  const { y, m, d } = localParts(nowIso, tz)
  const past = addDays(y, m, d, -WINDOW_DAYS)
  const cutoffIso = civilDateTimeToInstant(past.y, past.m, past.d, 0, 0, 0, tz)

  const categoryById = new Map<string, string>()
  for (const c of args.categories) categoryById.set(c.id, c.name)

  const filtered = args.transactions
    .filter((t) => !t.is_deleted && t.transacted_at >= cutoffIso)
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))

  // Drop oldest first if over cap.
  const trimmed = filtered.slice(-MAX_TRANSACTIONS)

  const transactions: AskMurmurTransaction[] = trimmed.map((t) => ({
    amount: t.amount,
    // `amount_in_profile_currency` is the field every server-side
    // aggregation actually sums (fix-plan 1.4/2.10) — sending it here is
    // what stops a foreign-currency row from counting at its raw,
    // wrong-currency face value once it reaches the reasoner.
    amount_in_profile_currency: t.amount_in_profile_currency ?? null,
    direction: t.direction,
    merchant: t.merchant ?? null,
    category_name: t.category_id ? (categoryById.get(t.category_id) ?? null) : null,
    transacted_at: t.transacted_at,
    is_recurring: !!t.is_recurring,
  }))

  const recurring_rules: AskMurmurRecurringRule[] = args.recurringRules
    .filter((r) => r.is_active)
    .map((r) => ({
      name: r.name ?? null,
      amount: r.amount,
      direction: r.direction,
      frequency: r.frequency,
    }))

  return {
    question: args.question.trim(),
    locale: args.locale,
    currency: args.currency,
    // The device's own clock reading + own IANA zone (fix-plan 2.10) —
    // the server resolves every window ("today", "this month", ...) from
    // these two fields, never from a bare date-only string re-parsed as
    // UTC midnight.
    now_utc: nowIso,
    time_zone: tz,
    monthly_income: args.monthly_income,
    transactions,
    recurring_rules,
  }
}

interface PostArgs {
  apiBaseUrl: string
  authToken: string
  request: AskMurmurRequest
  signal?: AbortSignal
}

/** POST /api/ai/ask-murmur. Throws on network or non-2xx response so the
 *  caller can render an error state. */
export async function postAskMurmur(args: PostArgs): Promise<AskMurmurResponse> {
  const response = await fetch(`${args.apiBaseUrl}/api/ai/ask-murmur`, {
    method: 'POST',
    signal: args.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.authToken}`,
    },
    body: JSON.stringify(args.request),
  })

  if (!response.ok) {
    throw new Error(`Ask Murmur request failed: ${response.status}`)
  }

  return (await response.json()) as AskMurmurResponse
}
