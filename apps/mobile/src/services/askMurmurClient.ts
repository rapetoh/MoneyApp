import { getCalendars } from 'expo-localization'
import { addDays, civilDateTimeToInstant, localParts, daysBetween } from '@voice-expense/shared'
import type {
  AskInsight,
  AskMurmurBudget,
  AskMurmurRecurringRuleV2,
  AskMurmurTransaction,
  AskTurnRequest,
  AskTurnResponse,
  Budget,
  BudgetStatus,
  Category,
  Locale,
  RecurringRule,
  Transaction,
} from '@voice-expense/shared'

// Ask Murmur client — the conversation turn endpoint
// (docs/ask-murmur/SPEC.md §5.3). The device ships the same data snapshot
// on every turn (12 months / 2,000 rows; the deterministic tools aggregate
// it server-side, rows never reach the model); the server owns the
// conversation itself.

const MAX_TRANSACTIONS = 2000
const WINDOW_DAYS = 366

/** IANA zone the device is currently in — same lookup `useProfile.ts`
 *  uses to capture `profiles.timezone`. Falls back to `'UTC'`. */
export function deviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

export interface AskDataArgs {
  locale: Locale
  currency: string
  monthly_income: number | null
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  categories: Category[]
  /** `profile.timezone` when loaded; falls back to the device zone. */
  timeZone?: string
  budget?: Budget | null
  budgetStatus?: BudgetStatus | null
}

/** The wire-shaped data snapshot (also the input of the insight engine). */
export function buildAskData(args: AskDataArgs): {
  transactions: AskMurmurTransaction[]
  recurring_rules: Array<AskMurmurRecurringRuleV2 & { amount_in_profile_currency?: number | null; is_active?: boolean }>
  budget: AskMurmurBudget | null
  now_utc: string
  time_zone: string
} {
  const tz = args.timeZone || deviceTimeZone()
  const nowIso = new Date().toISOString()
  const { y, m, d } = localParts(nowIso, tz)
  const past = addDays(y, m, d, -WINDOW_DAYS)
  const cutoffIso = civilDateTimeToInstant(past.y, past.m, past.d, 0, 0, 0, tz)

  const categoryById = new Map<string, string>()
  for (const c of args.categories) categoryById.set(c.id, c.name)

  const budget = toAskBudget(
    args.budget,
    args.budgetStatus,
    args.budget?.category_id ? (categoryById.get(args.budget.category_id) ?? null) : null,
    nowIso,
    tz,
  )

  const transactions: AskMurmurTransaction[] = args.transactions
    .filter((t) => !t.is_deleted && t.transacted_at >= cutoffIso)
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
    .slice(-MAX_TRANSACTIONS)
    .map((t) => ({
      amount: t.amount,
      amount_in_profile_currency: t.amount_in_profile_currency ?? null,
      direction: t.direction,
      merchant: t.merchant ?? null,
      category_name: t.category_id ? (categoryById.get(t.category_id) ?? null) : null,
      transacted_at: t.transacted_at,
      is_recurring: !!t.is_recurring,
      recurring_rule_id: t.recurring_rule_id ?? null,
    }))

  const recurring_rules = args.recurringRules
    .filter((r) => r.is_active && !r.is_deleted)
    .map((r) => ({
      id: r.id,
      name: r.name ?? null,
      amount: r.amount,
      amount_in_profile_currency: r.amount_in_profile_currency ?? null,
      direction: r.direction,
      frequency: r.frequency,
      category_name: r.category_id ? (categoryById.get(r.category_id) ?? null) : null,
      interval: r.interval,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      anchor_day: r.anchor_day,
      anchor_weekday: r.anchor_weekday,
      anchor_time: r.anchor_time,
      is_active: r.is_active,
    }))

  return { transactions, recurring_rules, budget, now_utc: nowIso, time_zone: tz }
}

function toAskBudget(
  budget: Budget | null | undefined,
  status: BudgetStatus | null | undefined,
  categoryName: string | null,
  nowIso: string,
  tz: string,
): AskMurmurBudget | null {
  if (!budget || !status) return null
  const now = localParts(nowIso, tz)
  const end = localParts(status.window.endExclusive, tz)
  return {
    amount: budget.amount,
    currency: budget.currency_code,
    period: budget.period as AskMurmurBudget['period'],
    category_name: categoryName,
    period_start: status.window.start,
    period_end: status.window.endExclusive,
    spent: status.spent,
    committed: status.committed,
    remaining: status.remaining,
    days_left: Math.max(1, daysBetween(now.y, now.m, now.d, end.y, end.m, end.d)),
  }
}

export function buildAskTurnRequest(args: {
  conversationId: string | null
  message: string
  seedInsight?: AskInsight | null
  data: AskDataArgs
}): AskTurnRequest {
  const snapshot = buildAskData(args.data)
  return {
    conversation_id: args.conversationId,
    message: args.message.trim(),
    seed_insight: args.seedInsight ? { kind: args.seedInsight.kind, title: args.seedInsight.title, detail: args.seedInsight.detail } : null,
    locale: args.data.locale,
    currency: args.data.currency,
    now_utc: snapshot.now_utc,
    time_zone: snapshot.time_zone,
    monthly_income: args.data.monthly_income,
    transactions: snapshot.transactions,
    recurring_rules: snapshot.recurring_rules.map(({ amount_in_profile_currency: _a, is_active: _b, ...rest }) => rest),
    ...(snapshot.budget ? { budget: snapshot.budget } : {}),
  }
}

export class AskTurnError extends Error {
  constructor(
    public readonly kind: 'plus_required' | 'busy' | 'not_found' | 'unauthorized' | 'failed',
    public readonly status: number,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(`ask turn failed: ${kind} (${status})`)
  }
}

/** POST /api/ai/ask-murmur/turn. Throws `AskTurnError` on non-2xx. */
export async function postAskTurn(args: {
  apiBaseUrl: string
  authToken: string
  request: AskTurnRequest
  signal?: AbortSignal
}): Promise<AskTurnResponse> {
  const response = await fetch(`${args.apiBaseUrl}/api/ai/ask-murmur/turn`, {
    method: 'POST',
    signal: args.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${args.authToken}` },
    body: JSON.stringify(args.request),
  })
  if (!response.ok) {
    let payload: { error?: string; retry_after_seconds?: number } | null = null
    try {
      payload = (await response.json()) as { error?: string; retry_after_seconds?: number }
    } catch {
      payload = null
    }
    if (response.status === 402) throw new AskTurnError('plus_required', 402)
    if (response.status === 401) throw new AskTurnError('unauthorized', 401)
    if (response.status === 404) throw new AskTurnError('not_found', 404)
    if (response.status === 429 || response.status === 503) {
      throw new AskTurnError('busy', response.status, payload?.retry_after_seconds ?? null)
    }
    throw new AskTurnError('failed', response.status)
  }
  return (await response.json()) as AskTurnResponse
}
