// Ask Murmur — entry insights (docs/ask-murmur/SPEC.md §1.1, §3.3).
//
// What Murmur says BEFORE the user types: ranked, specific, time-bound
// findings computed from the user's own data, each paired with one
// suggested decision. Deterministic and instant — no model call, no
// network — so it runs on the device the moment Ask opens, and every
// figure it shows is arithmetic over the same rows the tools sum
// (`amount_in_profile_currency`, civil-day windows in the user's zone
// via period.ts, occurrences via recurrence.ts).
//
// Text is templated per locale through `t()`; the engine returns finished
// strings so mobile and web render the same words.

import type {
  AskAction,
  AskInsight,
  AskInsightKind,
  AskMurmurBudget,
  AskMurmurRecurringRuleV2,
  AskMurmurTransaction,
} from '../types/ai'
import type { RecurringFrequency } from '../types/recurring'
import { t, type Locale } from '../i18n'
import {
  addDays,
  addMonthsClamped,
  civilDateTimeToInstant,
  localParts,
  monthBounds,
} from '../utils/period'
import { roundCents } from '../utils/currency'
import { firstOccurrenceOnOrAfter, monthlyEquivalent, occurrencesInWindow } from './recurrence'

export interface AskInsightRule extends AskMurmurRecurringRuleV2 {
  amount_in_profile_currency?: number | null
  is_active?: boolean
}

export interface AskInsightsInput {
  transactions: AskMurmurTransaction[]
  rules: AskInsightRule[]
  budget: AskMurmurBudget | null
  monthly_income: number | null
  now_utc: string
  time_zone: string
  currency: string
  locale: Locale
}

const MAX_INSIGHTS = 4
const VALID_FREQ: ReadonlySet<string> = new Set(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])

// ─── formatting ────────────────────────────────────────────────────────────

function fmtMoney(v: number, currency: string, locale: string): string {
  const whole = Math.abs(v - Math.round(v)) < 0.005
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(v)
  } catch {
    return `${currency} ${v.toFixed(whole ? 0 : 2)}`
  }
}

function fmtDate(instantIso: string, tz: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: tz }).format(new Date(instantIso))
  } catch {
    return instantIso.slice(0, 10)
  }
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

// ─── windows ───────────────────────────────────────────────────────────────

interface Span {
  startMs: number
  endMs: number
}

function inSpan(iso: string, s: Span): boolean {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) && ms >= s.startMs && ms < s.endMs
}

function amountOf(tx: AskMurmurTransaction): number | null {
  return typeof tx.amount_in_profile_currency === 'number' && Number.isFinite(tx.amount_in_profile_currency)
    ? tx.amount_in_profile_currency
    : null
}

function sumDebits(txns: AskMurmurTransaction[], span: Span, category?: string): number {
  let total = 0
  for (const tx of txns) {
    if (tx.direction !== 'debit') continue
    if (category !== undefined && (tx.category_name ?? '') !== category) continue
    if (!inSpan(tx.transacted_at, span)) continue
    const a = amountOf(tx)
    if (a !== null) total += a
  }
  return roundCents(total)
}

function sumCredits(txns: AskMurmurTransaction[], span: Span): number {
  let total = 0
  for (const tx of txns) {
    if (tx.direction !== 'credit' || !inSpan(tx.transacted_at, span)) continue
    const a = amountOf(tx)
    if (a !== null) total += a
  }
  return roundCents(total)
}

function debitsByCategory(txns: AskMurmurTransaction[], span: Span): Map<string, number> {
  const out = new Map<string, number>()
  for (const tx of txns) {
    if (tx.direction !== 'debit' || !inSpan(tx.transacted_at, span)) continue
    const a = amountOf(tx)
    if (a === null) continue
    const key = tx.category_name ?? ''
    out.set(key, (out.get(key) ?? 0) + a)
  }
  return out
}

/** Month-to-date span for the month `k` months before the current one,
 *  cut at the same day-of-month (clamped) — "by this point in the month". */
function sameSpanMonthsAgo(y: number, m: number, d: number, k: number, tz: string): Span {
  const target = addMonthsClamped(y, m, 1, -k)
  const startIso = monthBounds(`${String(target.y).padStart(4, '0')}-${String(target.m).padStart(2, '0')}`, tz).start
  const dim = new Date(Date.UTC(target.y, target.m, 0)).getUTCDate()
  const cut = addDays(target.y, target.m, Math.min(d, dim), 1)
  return {
    startMs: Date.parse(startIso),
    endMs: Date.parse(civilDateTimeToInstant(cut.y, cut.m, cut.d, 0, 0, 0, tz)),
  }
}

// ─── the engine ────────────────────────────────────────────────────────────

export function computeAskInsights(input: AskInsightsInput): AskInsight[] {
  const { transactions, currency, locale } = input
  const tz = safeTz(input.time_zone)
  const now = localParts(input.now_utc, tz)
  const nowMs = Date.parse(input.now_utc)
  const money = (v: number) => fmtMoney(v, currency, locale)
  const T = (key: string, params: Record<string, string | number> = {}) => fill(t(key, locale), params)
  const monthKey = `${String(now.y).padStart(4, '0')}-${String(now.m).padStart(2, '0')}`

  const monthB = monthBounds(monthKey, tz)
  const monthSpan: Span = { startMs: Date.parse(monthB.start), endMs: Date.parse(monthB.endExclusive) }
  const daysInMonth = new Date(Date.UTC(now.y, now.m, 0)).getUTCDate()
  const daysLeftInMonth = Math.max(1, daysInMonth - now.d + 1)

  const out: AskInsight[] = []

  // 0. no data — the only insight when the account is empty.
  const usable = transactions.filter((tx) => amountOf(tx) !== null)
  if (usable.length < 3) {
    return [
      {
        id: 'no_data',
        kind: 'no_data',
        score: 100,
        tone: 'neutral',
        title: T('ask.insight_nodata_title'),
        detail: T('ask.insight_nodata_detail'),
        question: T('ask.insight_nodata_question'),
        action: { label: T('ask.insight_nodata_action'), intent: 'log_expense' },
      },
    ]
  }

  const spentMtd = sumDebits(usable, monthSpan)
  const creditsMtd = sumCredits(usable, monthSpan)
  const incomeBasis: { value: number; from: 'transactions' | 'profile' } | null =
    creditsMtd > 0
      ? { value: creditsMtd, from: 'transactions' }
      : input.monthly_income && input.monthly_income > 0
        ? { value: input.monthly_income, from: 'profile' }
        : null

  // Recurring rules — active debit rules with a usable recurrence shape.
  const debitRules = input.rules.filter(
    (r) => r.direction === 'debit' && r.is_active !== false && VALID_FREQ.has(r.frequency),
  )
  const ruleAmount = (r: AskInsightRule) =>
    typeof r.amount_in_profile_currency === 'number' && Number.isFinite(r.amount_in_profile_currency)
      ? r.amount_in_profile_currency
      : r.amount
  const recurrenceOf = (r: AskInsightRule) =>
    r.starts_at
      ? {
          frequency: r.frequency as RecurringFrequency,
          interval: r.interval ?? 1,
          starts_at: r.starts_at,
          ends_at: r.ends_at ?? null,
          anchor_day: r.anchor_day ?? null,
          anchor_weekday: r.anchor_weekday ?? null,
          anchor_time: r.anchor_time ?? null,
        }
      : null

  // Bills still due between now and month end (occurrence-based, like the
  // Budgets tab's `committed`).
  let stillDue = 0
  for (const r of debitRules) {
    const rec = recurrenceOf(r)
    if (!rec) continue
    try {
      const occ = occurrencesInWindow(rec, input.now_utc, monthB.endExclusive, tz, { limit: 40 })
      stillDue += occ.length * ruleAmount(r)
    } catch {
      /* malformed rule — skip */
    }
  }
  stillDue = roundCents(stillDue)

  // 1. upcoming bill (≤ 7 days)
  {
    let best: { name: string; amount: number; instant: string } | null = null
    const horizonMs = nowMs + 7 * 864e5
    for (const r of debitRules) {
      const rec = recurrenceOf(r)
      if (!rec) continue
      try {
        const occ = firstOccurrenceOnOrAfter(rec, input.now_utc, tz)
        if (!occ) continue
        const ms = Date.parse(occ.instant)
        if (ms > horizonMs) continue
        if (!best || ms < Date.parse(best.instant) || (ms === Date.parse(best.instant) && ruleAmount(r) > best.amount)) {
          best = { name: r.name?.trim() || t('ask.insight_unnamed_rule', locale), amount: ruleAmount(r), instant: occ.instant }
        }
      } catch {
        /* skip */
      }
    }
    if (best) {
      const left = incomeBasis ? roundCents(incomeBasis.value - spentMtd - stillDue) : null
      out.push({
        id: `upcoming:${best.name}`,
        kind: 'upcoming_bill',
        score: 90,
        tone: left !== null && left < 0 ? 'alert' : 'watch',
        title: T('ask.insight_upcoming_title', { name: best.name, amount: money(best.amount), date: fmtDate(best.instant, tz, locale) }),
        detail:
          left !== null
            ? T('ask.insight_upcoming_detail_income', { due: money(stillDue), left: money(left) })
            : T('ask.insight_upcoming_detail_noincome', { due: money(stillDue) }),
        question: T('ask.insight_upcoming_question'),
        action: { label: T('ask.insight_upcoming_action'), intent: 'open_recurring', params: { name: best.name } },
      })
    }
  }

  // Usual daily spend — average over the previous 3 full months.
  const usualDaily = (() => {
    let total = 0
    let days = 0
    for (let k = 1; k <= 3; k++) {
      const target = addMonthsClamped(now.y, now.m, 1, -k)
      const key = `${String(target.y).padStart(4, '0')}-${String(target.m).padStart(2, '0')}`
      const b = monthBounds(key, tz)
      const span = { startMs: Date.parse(b.start), endMs: Date.parse(b.endExclusive) }
      const spent = sumDebits(usable, span)
      if (spent <= 0) continue
      total += spent
      days += new Date(Date.UTC(target.y, target.m, 0)).getUTCDate()
    }
    return days > 0 ? total / days : null
  })()

  // 2. budget pace
  if (input.budget) {
    const b = input.budget
    const days = Math.max(1, b.days_left)
    if (b.remaining < 0) {
      out.push({
        id: 'budget',
        kind: 'budget_pace',
        score: 95,
        tone: 'alert',
        title: T('ask.insight_budget_over_title', { over: money(Math.abs(b.remaining)) }),
        detail: T('ask.insight_budget_over_detail', { days, period: t(`ask.period_${b.period}`, locale) }),
        question: T('ask.insight_budget_question'),
        action: { label: T('ask.insight_budget_action'), intent: 'set_budget' },
      })
    } else {
      const pace = b.remaining / days
      const tight = usualDaily !== null && pace < usualDaily * 0.8
      out.push({
        id: 'budget',
        kind: 'budget_pace',
        score: tight ? 70 : 58,
        tone: tight ? 'watch' : 'good',
        title: T(tight ? 'ask.insight_budget_tight_title' : 'ask.insight_budget_ok_title', { left: money(b.remaining), days }),
        detail:
          usualDaily !== null
            ? T(tight ? 'ask.insight_budget_tight_detail' : 'ask.insight_budget_ok_detail', { pace: money(roundCents(pace)), usual: money(roundCents(usualDaily)) })
            : T('ask.insight_budget_pace_only', { pace: money(roundCents(pace)) }),
        question: T('ask.insight_budget_question'),
        action: { label: T('ask.insight_budget_action'), intent: 'set_budget' },
      })
    }
  }

  // 3. category surge (month-to-date vs same span in the previous 3 months)
  const mtdByCat = debitsByCategory(usable, monthSpan)
  const priorSpans = [1, 2, 3].map((k) => sameSpanMonthsAgo(now.y, now.m, now.d, k, tz))
  const priorByCat = priorSpans.map((s) => debitsByCategory(usable, s))
  let surge: { category: string; amount: number; pct: number } | null = null
  for (const [cat, amount] of mtdByCat) {
    if (!cat || amount < 25) continue
    const priors = priorByCat.map((m) => m.get(cat) ?? 0).filter((v) => v > 0)
    if (priors.length < 2) continue
    const avg = priors.reduce((a, b) => a + b, 0) / priors.length
    if (avg <= 0) continue
    const pct = (amount - avg) / avg
    if (pct < 0.4) continue
    if (!surge || pct > surge.pct) surge = { category: cat, amount, pct }
  }
  if (surge) {
    const pctRounded = Math.round(surge.pct * 100)
    out.push({
      id: `surge:${surge.category}`,
      kind: 'category_surge',
      score: 80 + Math.min(20, pctRounded / 5),
      tone: 'alert',
      title: T('ask.insight_surge_title', { category: surge.category, amount: money(surge.amount) }),
      detail: T('ask.insight_surge_detail', { pct: pctRounded }),
      question: T('ask.insight_surge_question', { category: surge.category }),
      action: {
        label: T('ask.insight_surge_action'),
        intent: 'show_transactions',
        params: { category_name: surge.category, month: monthKey },
      },
    })
  }

  // 4. subscriptions — recurring monthly total
  {
    const normalized = debitRules
      .map((r) => ({
        name: r.name?.trim() || t('ask.insight_unnamed_rule', locale),
        monthly: monthlyEquivalent({ frequency: r.frequency as RecurringFrequency, interval: r.interval ?? 1, amount: ruleAmount(r) }),
      }))
      .sort((a, b) => b.monthly - a.monthly)
    const total = roundCents(normalized.reduce((a, r) => a + r.monthly, 0))
    if (normalized.length >= 2 || total >= 50) {
      const [a, b] = normalized
      const title =
        normalized.length === 1
          ? T('ask.insight_subs_title_one', { a: a.name, total: money(total) })
          : normalized.length === 2
            ? T('ask.insight_subs_title_two', { a: a.name, b: b.name, total: money(total) })
            : T('ask.insight_subs_title_many', { a: a.name, b: b.name, n: normalized.length - 2, total: money(total) })
      out.push({
        id: 'subs',
        kind: 'subscriptions',
        score: 55,
        tone: 'neutral',
        title,
        detail: T('ask.insight_subs_detail'),
        question: T('ask.insight_subs_question'),
        action: { label: T('ask.insight_upcoming_action'), intent: 'open_recurring' },
      })
    }
  }

  // 5. biggest change vs last month (same span)
  {
    const lastByCat = priorByCat[0]
    let best: { category: string; delta: number } | null = null
    const cats = new Set<string>([...mtdByCat.keys(), ...lastByCat.keys()])
    for (const cat of cats) {
      if (!cat || (surge && cat === surge.category)) continue
      const delta = roundCents((mtdByCat.get(cat) ?? 0) - (lastByCat.get(cat) ?? 0))
      if (Math.abs(delta) < 30) continue
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { category: cat, delta }
    }
    if (best) {
      out.push({
        id: `delta:${best.category}`,
        kind: 'month_delta',
        score: 50,
        tone: best.delta > 0 ? 'watch' : 'good',
        title: T('ask.insight_delta_title', { category: best.category }),
        detail: T(best.delta > 0 ? 'ask.insight_delta_detail_up' : 'ask.insight_delta_detail_down', { delta: money(Math.abs(best.delta)) }),
        question: T('ask.insight_delta_question', { category: best.category }),
        action: {
          label: T('ask.insight_surge_action'),
          intent: 'show_transactions',
          params: { category_name: best.category, month: monthKey },
        },
      })
    }
  }

  // 6. net flow this month
  if (incomeBasis) {
    const over = roundCents(spentMtd - incomeBasis.value)
    if (over > 0) {
      out.push({
        id: 'netflow',
        kind: 'net_flow',
        score: 75,
        tone: 'alert',
        title: T('ask.insight_netflow_over_title', { over: money(over) }),
        detail: T('ask.insight_netflow_over_detail', { spent: money(spentMtd), income: money(incomeBasis.value) }),
        question: T('ask.insight_netflow_question'),
        action: null,
      })
    } else if (spentMtd > 0) {
      out.push({
        id: 'netflow',
        kind: 'net_flow',
        score: 45,
        tone: 'neutral',
        title: T('ask.insight_netflow_title', { spent: money(spentMtd), income: money(incomeBasis.value) }),
        detail: T('ask.insight_netflow_detail', { left: money(roundCents(incomeBasis.value - spentMtd)), days: daysLeftInMonth }),
        question: T('ask.insight_netflow_question'),
        action: null,
      })
    }
  }

  // 7. large transaction in the last 7 days
  {
    const weekSpan: Span = { startMs: nowMs - 7 * 864e5, endMs: nowMs + 1 }
    const ninety: Span = { startMs: nowMs - 90 * 864e5, endMs: nowMs + 1 }
    const debits90 = usable
      .filter((tx) => tx.direction === 'debit' && inSpan(tx.transacted_at, ninety))
      .map((tx) => amountOf(tx) as number)
      .sort((a, b) => a - b)
    if (debits90.length >= 8) {
      const median = debits90[Math.floor(debits90.length / 2)]
      let best: AskMurmurTransaction | null = null
      for (const tx of usable) {
        if (tx.direction !== 'debit' || tx.is_recurring || !inSpan(tx.transacted_at, weekSpan)) continue
        const a = amountOf(tx) as number
        if (a < 100 || a < 3 * median) continue
        if (!best || a > (amountOf(best) as number)) best = tx
      }
      if (best && median > 0) {
        const a = amountOf(best) as number
        const merchant = best.merchant?.trim() || best.category_name || t('ask.insight_unnamed_rule', locale)
        out.push({
          id: `large:${best.transacted_at}`,
          kind: 'large_transaction',
          score: 60,
          tone: 'watch',
          title: T('ask.insight_large_title', { merchant, amount: money(a), date: fmtDate(best.transacted_at, tz, locale) }),
          detail: T('ask.insight_large_detail', { times: Math.round(a / median) }),
          question: T('ask.insight_large_question', { merchant }),
          action: { label: T('ask.insight_large_action'), intent: 'show_transactions', params: { query: merchant } },
        })
      }
    }
  }

  // Rank, dedup by kind, cap.
  const seen = new Set<AskInsightKind>()
  return out
    .sort((a, b) => b.score - a.score)
    .filter((i) => (seen.has(i.kind) ? false : (seen.add(i.kind), true)))
    .slice(0, MAX_INSIGHTS)
}

/** Localized label + question for the intent chips under the insights. */
export function askIntentChips(locale: Locale): Array<{ id: string; label: string; question: string }> {
  return [
    { id: 'budget', label: t('ask.intent_budget', locale), question: t('ask.intent_budget_q', locale) },
    { id: 'subs', label: t('ask.intent_subs', locale), question: t('ask.intent_subs_q', locale) },
    { id: 'where', label: t('ask.intent_where', locale), question: t('ask.intent_where_q', locale) },
    { id: 'plan', label: t('ask.intent_plan', locale), question: t('ask.intent_plan_q', locale) },
  ]
}

/** Localized fallback label for an action the model or an insight emitted
 *  without one. */
export function askActionLabel(action: Pick<AskAction, 'intent' | 'label'>, locale: Locale): string {
  if (action.label?.trim()) return action.label
  switch (action.intent) {
    case 'show_transactions':
      return t('ask.action_show_transactions', locale)
    case 'set_budget':
      return t('ask.action_set_budget', locale)
    case 'open_recurring':
      return t('ask.action_open_recurring', locale)
    case 'log_expense':
      return t('ask.action_log_expense', locale)
    case 'create_rule':
      return t('ask.action_create_rule', locale)
  }
}

function safeTz(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}
