import type { PaymentMethod, TransactionDirection } from './transaction'

/** The model's classification of *intent* — fix-plan item 1.7, part 1:
 *  "the model classifies intent; code decides the sign." Before this
 *  field, the model returned `direction` directly, which conflated two
 *  different judgments: what kind of money movement this is, and which
 *  way it flows for accounting purposes. "Investing $300 at Schwab" and
 *  "selling $300 of stock" are both squarely about a brokerage transfer,
 *  but one is debit and one is credit — a model that gets the intent
 *  right but the sign wrong (or vice versa) used to be indistinguishable
 *  from one that got both right. `direction` is now *derived* from
 *  `flow_type` in code (`deriveDirectionFromFlowType`,
 *  packages/ai/src/validateParsedExpense.ts) — the model is never
 *  trusted to state the sign itself. */
export type FlowType = 'expense' | 'income' | 'transfer_out' | 'transfer_in' | 'refund' | 'reimbursement'

export interface ParsedExpense {
  amount: number
  currency: string
  /** Derived from `flow_type`, never taken directly from the model — see
   *  `FlowType`'s doc comment. Still the field every consumer reads
   *  (createTransaction, the confirm sheet, the recurring-rule trigger). */
  direction: TransactionDirection
  flow_type: FlowType
  merchant: string | null
  merchant_domain: string | null
  /** Residual detail from the transcript/image that no other field captures
   *  (fund names like "S&P 500", what the purchase was for, pay-period range).
   *  Pre-fills the Note field on the confirm sheet. */
  note: string | null
  category_suggestion: string | null
  payment_method: PaymentMethod | null
  transacted_at: string // ISO 8601
  confidence: number // 0.0 - 1.0
  needs_clarification: boolean
  clarifying_question: string | null
  // Recurring intelligence — AI guesses based on merchant/category context
  is_recurring_suggestion: boolean
  recurring_frequency_suggestion: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
}

// ─── Typed parse boundary (fix-plan item 1.7) ───────────────────────────────
//
// Every model response bound for `ParsedExpense` must pass through
// `validateParsedExpense` (packages/ai/src/validateParsedExpense.ts) before
// it reaches a save path. A response that fails the contract — an enum
// value outside the DB's CHECK constraints, a non-finite amount, an
// unparseable date — is never coerced into a defaulted row; it comes back
// as a `ParseRejection` the UI can surface instead. The same module's
// `validateTransactionWriteFields` is the narrower third boundary: it runs
// inside `createTransaction` itself on every write regardless of source
// (AI parse, manual entry, a shortcut deep link, the notification
// listener), so a bad `currency_code`/`payment_method`/`direction`/
// `amount` is refused before a single row reaches SQLite.

/** One field-level failure from `validateParsedExpense`. `field` names the
 *  `ParsedExpense` key (or `"root"` when the response wasn't even a JSON
 *  object); `message` is human-readable and safe to log or display. */
export interface ParseFieldError {
  field: string
  message: string
}

/** The typed-rejection half of `validateParsedExpense`'s return union. The
 *  `rejected: true` discriminant is what a caller checks — never present on
 *  a valid `ParsedExpense`. */
export interface ParseRejection {
  rejected: true
  errors: ParseFieldError[]
}

// ─── Ask Murmur (Phase E) ────────────────────────────────────────────────────
//
// Wire format for the grounded-reasoner endpoint at /api/ai/ask-murmur.
// Shared by mobile client + web route + AI prompt module so the three move
// together. Free-form prose is intentionally avoided in the response — the
// model returns a structured shape that the result screen renders directly.

import type { Locale } from '../i18n'

/** Compact transaction record sent to the Ask reasoner. Omits internal sync
 *  fields. Date is ISO so the model can reason about recency. */
export interface AskMurmurTransaction {
  amount: number
  /** Amount converted to the user's profile currency — mirrors
   *  `Transaction.amount_in_profile_currency`
   *  (packages/shared/src/types/transaction.ts). Null on a row still
   *  awaiting its FX snapshot. Every aggregation the reasoner performs
   *  must sum this field, never `amount` — fix-plan 2.10: a €50 dinner
   *  summed by raw `amount` counted as $50, silently contradicting
   *  every other totals-rendering surface in the app, which routes
   *  through this same field via `packages/shared/src/domain/money.ts`'s
   *  `summarize()`. */
  amount_in_profile_currency: number | null
  direction: 'debit' | 'credit'
  merchant: string | null
  category_name: string | null
  transacted_at: string
  is_recurring: boolean
}

export interface AskMurmurRecurringRule {
  name: string | null
  amount: number
  direction: 'debit' | 'credit'
  frequency: string
}

/** Single prior turn used to give the reasoner conversation context on
 *  desktop. The mobile result-card flow is one-shot and sends no history;
 *  desktop renders a chat thread and replays the last few turns so the model
 *  can resolve "and last month?" / "show me only weekends" follow-ups. Each
 *  prior turn is stored as the user's question + the assistant's verdict
 *  text — we keep history compact (model doesn't need the full breakdown
 *  card to resolve the next question). */
export interface AskMurmurHistoryTurn {
  question: string
  answer: string
}

export interface AskMurmurRequest {
  question: string
  locale: Locale
  currency: string
  /** Full ISO 8601 instant for "now" as the client's clock reads it, e.g.
   *  "2026-09-01T01:00:00Z" — fix-plan 2.10. Replaces the old date-only
   *  `today` field, which the server re-parsed as UTC midnight and read
   *  back with local `Date` getters: an 8pm Central "today" resolved to
   *  tomorrow's (empty) UTC day. Every window ("today", "this month",
   *  "last 90 days", ...) is resolved from this instant through
   *  `time_zone` below — never taken as a date string on its own. */
  now_utc: string
  /** IANA time zone the windows above resolve in, e.g.
   *  "America/Chicago" — the user's own zone (`profile.timezone` on
   *  web, the device zone on mobile), never the reading process's zone
   *  (Vercel's UTC in production, the dev/test runner's own zone
   *  otherwise). */
  time_zone: string
  monthly_income: number | null
  /** Cap: last 12 months, max 2,000 entries (oldest dropped client-side). */
  transactions: AskMurmurTransaction[]
  recurring_rules: AskMurmurRecurringRule[]
  /** Optional. The user's active budget *as the app already computes it*
   *  (`budgetStatus` in packages/shared/src/domain/budget.ts — the same
   *  numbers the Budgets tab shows), so "how am I doing against my
   *  budget?" is answered from the app's own status, never re-derived.
   *  Omitted when no budget is set. */
  budget?: AskMurmurBudget | null
  /** Optional. Prior turns in the same conversation (oldest first). Capped
   *  server-side to the last 6 turns. Both the web thread and the mobile
   *  thread send it. */
  history?: AskMurmurHistoryTurn[]
}

export interface AskMurmurBudget {
  amount: number
  currency: string
  period: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  /** Null = whole-spend budget; otherwise the category it caps. */
  category_name: string | null
  /** Current period, half-open ISO instants, in the user's zone. */
  period_start: string
  period_end: string
  spent: number
  /** Known-but-not-yet-posted outflow inside the period (due recurring). */
  committed: number
  /** `amount − spent − committed`, may be negative (over budget). */
  remaining: number
  days_left: number
}

/** Visualization the model can attach to a verdict to make a numeric story
 *  legible at a glance. The client renders SVG \u2014 the model never returns
 *  raw SVG. We keep the shape narrow on purpose so the model can't hallucinate
 *  weird grammars; what we lose in expressiveness we gain in safety. */
export type AskMurmurChartType =
  /** Vertical bars. Use for time series with discrete buckets (last 6 weekdays,
   *  last 12 months) where order matters along the x-axis. */
  | 'bar'
  /** Smooth line. Use for trend over time (cumulative spend over the month,
   *  monthly spend across 6+ months). */
  | 'line'
  /** Donut. Use for share-of-total when there are 3\u20136 buckets and the user
   *  cares about proportions (top categories, expense vs. income). */
  | 'donut'
  /** Horizontal bars. Use for a ranked list (top merchants, top categories)
   *  where labels are long and order matters. */
  | 'horizontal_bar'

export interface AskMurmurChartPoint {
  /** Short label for the x-axis or legend. Localized by the model. */
  label: string
  /** Numeric value. Currency follows request.currency \u2014 the client formats. */
  value: number
}

export interface AskMurmurChart {
  type: AskMurmurChartType
  /** Short title rendered above the chart. Localized. */
  title: string
  /** 2\u201310 points. Anything outside that range is clipped client-side. */
  data: AskMurmurChartPoint[]
  /** Optional one-line caption under the chart for context. Localized. */
  caption?: string
}

/** A single row in the breakdown card on S_AskResult. */
export interface AskMurmurStatRow {
  label: string
  /** Already-formatted display string (e.g. "$4,120", "+$150", "≈ 3.3 months").
   *  The model formats — the client renders verbatim. */
  value: string
  /** Sage-tinted value (positive call-out: "+$150 left over"). */
  accent?: boolean
  /** Greyed-out value (informational, e.g. "Avg monthly income"). */
  muted?: boolean
}

export type AskMurmurActionIntent =
  | 'create_goal'
  | 'show_category'
  | 'set_budget'
  | 'show_transactions'

export interface AskMurmurAction {
  /** Localized button label. Model returns it in the user's locale. */
  label: string
  intent: AskMurmurActionIntent
  /** Free-form params keyed to the intent. e.g. `{ category_name: "Coffee" }`
   *  for `show_category`, `{ goal_name: "PS5", monthly_amount: "100" }` for
   *  `create_goal`. The result screen forwards these to the destination once
   *  those destinations exist. */
  params?: Record<string, string>
}

export interface AskMurmurResponse {
  /** Headline answer. Short, serif-rendered. May contain inline `<b>` for
   *  emphasis on a single phrase the verdict hinges on. */
  verdict: {
    text: string
    sentiment: 'positive' | 'neutral' | 'negative'
  }
  /** Optional breakdown card. Omitted when the answer doesn't have a
   *  numeric story to tell (e.g. a refusal). */
  breakdown?: {
    /** Eyebrow over the rows, e.g. "From your last 3 months". */
    caption: string
    rows: AskMurmurStatRow[]
  }
  /** Optional chart attached to the answer. Use it when the data has a
   *  shape worth seeing (categories breakdown, monthly trend, top merchants).
   *  Omitted for one-number questions or refusals. */
  chart?: AskMurmurChart
  /** Optional sage-tinted note — a single-paragraph nudge or insight. */
  note?: {
    text: string
  }
  /** Action pills under the bubble. Empty array when none apply. */
  actions: AskMurmurAction[]
  /** Always returned — count of transactions the model could see. Surfaced
   *  on the attribution line so the user can audit grounding. */
  attribution: {
    transaction_count: number
  }
  /** True when the model could not answer from the user's data alone (e.g.
   *  "what's the current S&P 500 price"). When true, breakdown / actions
   *  are typically empty and the verdict explains the refusal politely. */
  out_of_scope: boolean
}
