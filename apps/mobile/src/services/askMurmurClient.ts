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

interface BuildArgs {
  question: string
  locale: Locale
  currency: string
  monthly_income: number | null
  transactions: Transaction[]
  recurringRules: RecurringRule[]
  categories: Category[]
}

/** Trim local stores into the wire shape the reasoner expects. Keep only the
 *  last 90 days of non-deleted transactions, drop oldest first if we still
 *  exceed the 500-row cap. */
export function buildAskMurmurRequest(args: BuildArgs): AskMurmurRequest {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WINDOW_DAYS)
  const cutoffIso = cutoff.toISOString()

  const categoryById = new Map<string, string>()
  for (const c of args.categories) categoryById.set(c.id, c.name)

  const filtered = args.transactions
    .filter((t) => !t.is_deleted && t.transacted_at >= cutoffIso)
    .sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))

  // Drop oldest first if over cap.
  const trimmed = filtered.slice(-MAX_TRANSACTIONS)

  const transactions: AskMurmurTransaction[] = trimmed.map((t) => ({
    amount: t.amount,
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
    today: new Date().toISOString().split('T')[0],
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
