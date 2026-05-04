import type { PaymentMethod, TransactionDirection } from './transaction'

export interface ParsedExpense {
  amount: number
  currency: string
  direction: TransactionDirection
  merchant: string | null
  merchant_domain: string | null
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

export interface AdvisorContext {
  monthly_income: number | null
  avg_monthly_spend_last_3mo: number
  top_categories: { name: string; avg_monthly: number }[]
  recurring_expenses: { name: string; amount: number; frequency: string }[]
  current_month_spent: number
  safe_to_spend_remaining: number
  implied_monthly_savings: number
  user_question: string
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
  /** ISO date of "today" in the user's timezone. Anchors any "this month",
   *  "next month" reasoning. */
  today: string
  monthly_income: number | null
  /** Cap: last 90 days, max 500 entries (oldest dropped client-side). */
  transactions: AskMurmurTransaction[]
  recurring_rules: AskMurmurRecurringRule[]
  /** Optional. Prior turns in the same desktop conversation (oldest first).
   *  Capped server-side to the last 6 turns. Mobile sends none — the result
   *  card is one-shot. */
  history?: AskMurmurHistoryTurn[]
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
