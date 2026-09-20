/**
 * The notification engine — what Murmur is allowed to say, and when.
 *
 * Why this lives in `packages/shared` and not in the Edge Function.
 * Everything worth notifying about is a claim about the user's money:
 * "rent lands tomorrow and you will be 380 short", "you passed your
 * budget". A claim computed one way on the server and another way in the
 * app is how a notification ends up contradicting the screen it opens.
 * So the decision runs through the same `budgetStatus` / `recurrence` /
 * `computeAskInsights` the two apps already render from, and the server
 * imports this file through the generated Deno bundle
 * (scripts/build-shared-deno.mjs). The Edge Function is transport only.
 *
 * Two halves, deliberately separate:
 *
 *   planNotifications()  pure. Given a user's data, what is TRUE and
 *                        worth saying right now. Knows nothing about
 *                        quiet hours, caps, or what was said yesterday.
 *   govern()             pure. Given those candidates and the user's
 *                        consent and history, which single one (if any)
 *                        actually goes out.
 *
 * Keeping them apart is what makes the thing testable: "does a bill due
 * tomorrow produce a candidate" and "is a user who got two messages this
 * week allowed a third" are different questions with different bugs.
 *
 * The governor is not optional and not a tuning knob. Published
 * benchmarks put the fatigue inflection around five sends a week and a
 * roughly 3.4x uninstall risk above six; Murmur defaults to three, one a
 * day, and treats silence as a correct outcome. A notification system
 * without a ceiling is a worse product than no notification system.
 */

import type { AskMurmurBudget, AskMurmurTransaction } from '../types/ai'
import type { Locale } from '../i18n'
import { t } from '../i18n'
import { budgetStatus, type BudgetStatusInput, type BudgetStatusRule, type BudgetStatusTransaction } from './budget'
import { computeAskInsights, type AskInsightRule } from './askInsights'
import { occurrencesInWindow } from './recurrence'
import { roundCents } from '../utils/currency'
import { localDay, localParts } from '../utils/period'

// ─── vocabulary ────────────────────────────────────────────────────────────

/** The six families. A user can mute any of them except `money`, which is
 *  transactional: someone who turned off weekly recaps has not asked to
 *  be kept in the dark about a failed payment. */
export type NotificationFamily = 'receipt' | 'bill' | 'budget' | 'insight' | 'habit' | 'money'

/**
 * iOS interruption level.
 *  - `time-sensitive` breaks through Focus and the scheduled summary.
 *    Reserved for money that moves within a day and can still be acted
 *    on. Overusing it is how an app loses the privilege.
 *  - `passive` lands quietly and is happy to be batched into the summary.
 *  - `active` is the default banner.
 */
export type NotificationUrgency = 'passive' | 'active' | 'time-sensitive'

export interface NotificationCandidate {
  family: NotificationFamily
  /** Stable machine name, also the i18n key prefix and the analytics key. */
  kind: string
  /**
   * Identity of the CLAIM, not of the message. Two sweeps an hour apart
   * that reach the same conclusion must produce the same key, because the
   * log's unique index on it is the entire "never say the same thing
   * twice" guarantee. Always scoped by the period or occurrence the claim
   * is about, never by the wall clock.
   */
  dedupeKey: string
  /** Higher wins. See PRIORITY below for the ladder. */
  priority: number
  title: string
  body: string
  /** Deep-link payload. Every notification opens the screen that proves it. */
  data: Record<string, string>
  urgency: NotificationUrgency
  /** Bypasses the weekly cap and the family switch. Billing and security only. */
  transactional?: boolean
}

/**
 * The priority ladder, in one place so the ordering is arguable rather
 * than scattered. The rule behind the numbers: money that is about to
 * move outranks money that already moved, which outranks an observation,
 * which outranks a request for the user's effort.
 */
const PRIORITY = {
  billing_issue: 100,
  trial_ending: 95,
  plus_lapsed: 90,
  bill_tomorrow: 85,
  budget_over: 80,
  bill_missing: 75,
  budget_80: 70,
  budget_category_over: 65,
  bill_week_heavy: 55,
  month_closed: 50,
  category_surge: 45,
  weekly_recap: 40,
  winback_14: 30,
  winback_30: 28,
  winback_60: 26,
} as const

const DAY_MS = 86_400_000

// ─── input ─────────────────────────────────────────────────────────────────

/** Plus state, exactly the `profiles.plus_*` columns the server reads. */
export interface NotificationPlusState {
  plus_status: 'active' | 'lapsed' | 'free' | null
  plus_period_type: 'trial' | 'intro' | 'normal' | null
  plus_expires_at: string | null
  plus_will_renew: boolean | null
  plus_billing_issue_at: string | null
  plus_grace_until: string | null
}

export interface NotificationPlanInput {
  nowUtc: string
  timeZone: string
  locale: Locale
  currency: string
  monthlyIncome: number | null
  transactions: AskMurmurTransaction[]
  /** Same rules `computeAskInsights` takes, plus the fields `budgetStatus` needs. */
  rules: (AskInsightRule & Partial<BudgetStatusRule>)[]
  /** Active budgets: the overall one (category_id null) and any category ones. */
  budgets: (BudgetStatusInput & { id: string; category_name?: string | null })[]
  plus: NotificationPlusState
  /** When the user last logged something themselves, for the win-backs. */
  lastLoggedAt: string | null
}

// ─── formatting ────────────────────────────────────────────────────────────

function money(v: number, currency: string, locale: string): string {
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

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

function amountOf(tx: AskMurmurTransaction): number | null {
  return typeof tx.amount_in_profile_currency === 'number' && Number.isFinite(tx.amount_in_profile_currency)
    ? tx.amount_in_profile_currency
    : null
}

/** Whole days from `a` to `b`, positive when `b` is later. */
function daysBetween(aMs: number, bMs: number): number {
  return Math.floor((bMs - aMs) / DAY_MS)
}

// ─── the planner ───────────────────────────────────────────────────────────

/**
 * Everything true and worth saying about this user right now, unranked by
 * consent and unfiltered by history. Returns candidates in no particular
 * order; `govern()` chooses.
 *
 * Every branch here answers "would a reasonable person want their phone to
 * buzz for this", and the thresholds are deliberately conservative: a
 * notification that turns out to be noise costs the permission itself.
 */
export function planNotifications(input: NotificationPlanInput): NotificationCandidate[] {
  const { nowUtc, timeZone: tz, locale, currency, plus } = input
  const nowMs = Date.parse(nowUtc)
  if (!Number.isFinite(nowMs)) return []

  const T = (key: string, params: Record<string, string | number> = {}) => fill(t(key, locale), params)
  const m = (v: number) => money(v, currency, locale)
  const out: NotificationCandidate[] = []

  // ── money: transactional, never suppressed by a family switch ──────────

  // A failed card. This is the sharpest gap in the product today: the
  // store tells RevenueCat, RevenueCat tells our webhook, the webhook
  // flips the entitlement, and the person finds out by noticing Plus
  // stopped working. The grace window is exactly the time in which
  // telling them is still useful.
  if (plus.plus_billing_issue_at) {
    const graceMs = plus.plus_grace_until ? Date.parse(plus.plus_grace_until) : NaN
    const stillInGrace = Number.isFinite(graceMs) && graceMs > nowMs
    // One per billing incident, not per day: the key is the detection
    // instant, so a card that stays broken does not nag.
    out.push({
      family: 'money',
      kind: 'billing_issue',
      dedupeKey: `billing_issue:${plus.plus_billing_issue_at}`,
      priority: PRIORITY.billing_issue,
      title: T('notif.billing_issue_title'),
      body: stillInGrace
        ? T('notif.billing_issue_body_grace', { days: Math.max(1, daysBetween(nowMs, graceMs)) })
        : T('notif.billing_issue_body'),
      data: { screen: 'paywall', reason: 'billing_issue' },
      urgency: 'time-sensitive',
      transactional: true,
    })
  }

  // Trial about to convert. Said plainly, two days out, because a charge
  // nobody saw coming is a refund request and a one-star review. Only
  // when it will actually renew: a trial the user already turned off is
  // not news.
  if (plus.plus_status === 'active' && plus.plus_period_type === 'trial' && plus.plus_expires_at) {
    const endMs = Date.parse(plus.plus_expires_at)
    const daysLeft = daysBetween(nowMs, endMs)
    if (Number.isFinite(endMs) && endMs > nowMs && daysLeft <= 2) {
      const willRenew = plus.plus_will_renew !== false
      out.push({
        family: 'money',
        kind: 'trial_ending',
        dedupeKey: `trial_ending:${plus.plus_expires_at}`,
        priority: PRIORITY.trial_ending,
        title: willRenew ? T('notif.trial_ending_title') : T('notif.trial_ending_off_title'),
        body: willRenew
          ? T('notif.trial_ending_body', { days: Math.max(1, daysLeft + 1) })
          : T('notif.trial_ending_off_body'),
        data: { screen: 'paywall', reason: 'trial_ending' },
        urgency: 'active',
        transactional: true,
      })
    }
  }

  // Plus ended. Named for what stopped working, not for what we want back.
  if (plus.plus_status === 'lapsed' && plus.plus_expires_at && !plus.plus_billing_issue_at) {
    const endedMs = Date.parse(plus.plus_expires_at)
    if (Number.isFinite(endedMs) && nowMs - endedMs < 3 * DAY_MS && endedMs <= nowMs) {
      out.push({
        family: 'money',
        kind: 'plus_lapsed',
        dedupeKey: `plus_lapsed:${plus.plus_expires_at}`,
        priority: PRIORITY.plus_lapsed,
        title: T('notif.plus_lapsed_title'),
        body: T('notif.plus_lapsed_body'),
        data: { screen: 'paywall', reason: 'lapsed' },
        urgency: 'passive',
        transactional: true,
      })
    }
  }

  // ── bills: the family that can actually save the user money ────────────

  const debitRules = input.rules.filter(
    (r) => r.direction === 'debit' && r.is_active !== false && r.starts_at,
  )
  const ruleAmount = (r: AskInsightRule & Partial<BudgetStatusRule>) =>
    typeof r.amount_in_profile_currency === 'number' && Number.isFinite(r.amount_in_profile_currency)
      ? r.amount_in_profile_currency
      : r.amount
  const recurrenceOf = (r: AskInsightRule & Partial<BudgetStatusRule>) =>
    r.starts_at
      ? {
          frequency: r.frequency,
          interval: r.interval ?? 1,
          starts_at: r.starts_at,
          ends_at: r.ends_at ?? null,
          anchor_day: r.anchor_day ?? null,
          anchor_weekday: r.anchor_weekday ?? null,
          anchor_time: r.anchor_time ?? null,
        }
      : null

  // Everything charging in the next 7 days, priced once and reused by the
  // three bill candidates below.
  interface Upcoming {
    name: string
    amount: number
    instant: string
    ruleId: string
    occurrenceDate: string
  }
  const upcoming: Upcoming[] = []
  for (const r of debitRules) {
    const rec = recurrenceOf(r)
    if (!rec) continue
    try {
      const occ = occurrencesInWindow(rec, nowUtc, new Date(nowMs + 7 * DAY_MS).toISOString(), tz, { limit: 20 })
      for (const o of occ) {
        upcoming.push({
          name: r.name?.trim() || t('ask.insight_unnamed_rule', locale),
          amount: ruleAmount(r),
          instant: o.instant,
          ruleId: String(r.id ?? r.name ?? 'rule'),
          occurrenceDate: o.occurrenceDate,
        })
      }
    } catch {
      /* malformed rule: it simply produces no candidate */
    }
  }
  upcoming.sort((a, b) => Date.parse(a.instant) - Date.parse(b.instant))

  // What is still committed between now and month end, so the bill
  // notification can say what is LEFT rather than only what is due. This
  // is the number the user actually needs.
  let stillDue = 0
  const monthEnd = (() => {
    const p = localParts(nowUtc, tz)
    const dim = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate()
    return Date.parse(nowUtc) + Math.max(0, dim - p.d + 1) * DAY_MS
  })()
  for (const r of debitRules) {
    const rec = recurrenceOf(r)
    if (!rec) continue
    try {
      const occ = occurrencesInWindow(rec, nowUtc, new Date(monthEnd).toISOString(), tz, { limit: 40 })
      stillDue += occ.length * ruleAmount(r)
    } catch {
      /* skip */
    }
  }
  stillDue = roundCents(stillDue)

  const monthKey = localDay(nowUtc, tz).slice(0, 7)
  const spentThisMonth = input.transactions.reduce((sum, tx) => {
    if (tx.direction !== 'debit') return sum
    if (localDay(tx.transacted_at, tz).slice(0, 7) !== monthKey) return sum
    return sum + (amountOf(tx) ?? 0)
  }, 0)
  const incomeThisMonth = input.transactions.reduce((sum, tx) => {
    if (tx.direction !== 'credit') return sum
    if (localDay(tx.transacted_at, tz).slice(0, 7) !== monthKey) return sum
    return sum + (amountOf(tx) ?? 0)
  }, 0)
  const incomeBasis =
    incomeThisMonth > 0 ? incomeThisMonth : input.monthlyIncome && input.monthlyIncome > 0 ? input.monthlyIncome : null
  const leftAfterBills = incomeBasis !== null ? roundCents(incomeBasis - spentThisMonth - stillDue) : null

  // The single most valuable message in the catalogue: a bill lands
  // within about a day, and here is what remains once it does.
  const tomorrow = upcoming.find((u) => {
    const inMs = Date.parse(u.instant) - nowMs
    return inMs > 0 && inMs <= 36 * 3600 * 1000
  })
  if (tomorrow) {
    out.push({
      family: 'bill',
      kind: 'bill_tomorrow',
      dedupeKey: `bill_tomorrow:${tomorrow.ruleId}:${tomorrow.occurrenceDate}`,
      priority: PRIORITY.bill_tomorrow,
      title: T('notif.bill_tomorrow_title', { name: tomorrow.name, amount: m(tomorrow.amount) }),
      body:
        leftAfterBills !== null
          ? T('notif.bill_tomorrow_body_left', { left: m(leftAfterBills) })
          : T('notif.bill_tomorrow_body', { due: m(stillDue) }),
      data: { screen: 'recurring', rule: tomorrow.ruleId },
      // Money leaving an account within a day is the definition of the
      // level: still actionable, and useless if it arrives late.
      urgency: 'time-sensitive',
    })
  } else if (upcoming.length >= 3) {
    // No single bill is imminent, but the week is loaded. Worth one line.
    const total = roundCents(upcoming.reduce((s, u) => s + u.amount, 0))
    out.push({
      family: 'bill',
      kind: 'bill_week_heavy',
      dedupeKey: `bill_week_heavy:${localDay(nowUtc, tz)}`,
      priority: PRIORITY.bill_week_heavy,
      title: T('notif.bill_week_title', { count: upcoming.length, amount: m(total) }),
      body: T('notif.bill_week_body', { name: upcoming[0].name, amount: m(upcoming[0].amount) }),
      data: { screen: 'recurring' },
      urgency: 'passive',
    })
  }

  // A bill that was due and never arrived. The PRD promised this one and
  // it was never built. Requires the occurrence to be 2 to 9 days past:
  // sooner and the charge may simply be in flight, later and it is
  // history rather than news.
  for (const r of debitRules) {
    const rec = recurrenceOf(r)
    if (!rec) continue
    let occ
    try {
      occ = occurrencesInWindow(rec, new Date(nowMs - 9 * DAY_MS).toISOString(), new Date(nowMs - 2 * DAY_MS).toISOString(), tz, { limit: 5 })
    } catch {
      continue
    }
    if (!occ.length) continue
    const last = occ[occ.length - 1]
    const amount = ruleAmount(r)
    // Anything that looks like the charge: same rule, or an untagged
    // transaction of about the right size within three days of the date.
    const matched = input.transactions.some((tx) => {
      if (tx.direction !== 'debit') return false
      const txMs = Date.parse(tx.transacted_at)
      if (!Number.isFinite(txMs)) return false
      if (Math.abs(txMs - Date.parse(last.instant)) > 3 * DAY_MS) return false
      const a = amountOf(tx)
      return a !== null && Math.abs(a - amount) <= Math.max(1, amount * 0.1)
    })
    if (matched) continue
    out.push({
      family: 'bill',
      kind: 'bill_missing',
      dedupeKey: `bill_missing:${String(r.id ?? r.name)}:${last.occurrenceDate}`,
      priority: PRIORITY.bill_missing,
      title: T('notif.bill_missing_title', { name: r.name?.trim() || t('ask.insight_unnamed_rule', locale) }),
      body: T('notif.bill_missing_body', { amount: m(amount) }),
      data: { screen: 'recurring', rule: String(r.id ?? '') },
      urgency: 'active',
    })
    break // one missing-bill message at a time, not one per rule
  }

  // ── budget ─────────────────────────────────────────────────────────────

  const budgetRules = input.rules.filter((r): r is AskInsightRule & BudgetStatusRule =>
    Boolean(r.id && r.starts_at && typeof r.amount === 'number'),
  ) as unknown as BudgetStatusRule[]
  const budgetTxns = input.transactions as unknown as BudgetStatusTransaction[]

  for (const b of input.budgets) {
    let status
    try {
      status = budgetStatus(b, budgetTxns, budgetRules, tz, nowUtc)
    } catch {
      continue
    }
    const windowKey = String(status.window.start ?? '').slice(0, 10)
    const daysLeft = Math.max(0, Math.ceil((Date.parse(String(status.window.endExclusive)) - nowMs) / DAY_MS))
    const isCategory = b.category_id != null

    if (status.pct >= 1) {
      out.push({
        family: 'budget',
        kind: isCategory ? 'budget_category_over' : 'budget_over',
        dedupeKey: `${isCategory ? 'budget_category_over' : 'budget_over'}:${b.id}:${windowKey}`,
        priority: isCategory ? PRIORITY.budget_category_over : PRIORITY.budget_over,
        title: isCategory
          ? T('notif.budget_category_over_title', { category: b.category_name ?? '', over: m(Math.abs(status.remaining)) })
          : T('notif.budget_over_title', { over: m(Math.abs(status.remaining)) }),
        body: T('notif.budget_over_body', { days: daysLeft }),
        data: { screen: 'budgets', budget: b.id },
        urgency: 'active',
      })
    } else if (status.pct >= 0.8 && daysLeft >= 2 && !isCategory) {
      // The pace line is the useful half: a percentage alone tells the
      // user off, a per-day figure tells them what to do.
      const perDay = roundCents(status.remaining / Math.max(1, daysLeft))
      out.push({
        family: 'budget',
        kind: 'budget_80',
        dedupeKey: `budget_80:${b.id}:${windowKey}`,
        priority: PRIORITY.budget_80,
        title: T('notif.budget_80_title', { pct: Math.round(status.pct * 100), days: daysLeft }),
        body: T('notif.budget_80_body', { perDay: m(perDay), left: m(status.remaining) }),
        data: { screen: 'budgets', budget: b.id },
        urgency: 'active',
      })
    }
  }

  // ── insights: the brain, finally delivered ─────────────────────────────

  const local = localParts(nowUtc, tz)
  const weekday = new Date(Date.parse(nowUtc)).getUTCDay()

  // Reuse the shipped insight engine rather than inventing parallel
  // thresholds: whatever Ask would show, a notification can quote.
  let insights: ReturnType<typeof computeAskInsights> = []
  try {
    insights = computeAskInsights({
      transactions: input.transactions,
      rules: input.rules as AskInsightRule[],
      budget: (input.budgets.find((b) => b.category_id == null) ?? null) as AskMurmurBudget | null,
      monthly_income: input.monthlyIncome,
      now_utc: nowUtc,
      time_zone: tz,
      currency,
      locale,
    })
  } catch {
    insights = []
  }

  const surge = insights.find((i) => i.kind === 'category_surge')
  if (surge) {
    out.push({
      family: 'insight',
      kind: 'category_surge',
      dedupeKey: `category_surge:${surge.id}:${monthKey}`,
      priority: PRIORITY.category_surge,
      title: surge.title,
      body: surge.detail,
      data: { screen: 'ask', insight: surge.id },
      urgency: 'passive',
    })
  }

  // Month closed: on the 1st, about the month that just ended.
  if (local.d === 1) {
    const delta = insights.find((i) => i.kind === 'month_delta')
    if (delta) {
      out.push({
        family: 'insight',
        kind: 'month_closed',
        dedupeKey: `month_closed:${monthKey}`,
        priority: PRIORITY.month_closed,
        title: delta.title,
        body: delta.detail,
        data: { screen: 'insights' },
        urgency: 'passive',
      })
    }
  }

  // Weekly recap: Sunday, and only for someone with a real week behind
  // them. A recap of two transactions is not a recap.
  if (weekday === 0) {
    const weekStart = nowMs - 7 * DAY_MS
    const weekTxns = input.transactions.filter(
      (tx) => tx.direction === 'debit' && Date.parse(tx.transacted_at) >= weekStart && amountOf(tx) !== null,
    )
    if (weekTxns.length >= 5) {
      const total = roundCents(weekTxns.reduce((s, tx) => s + (amountOf(tx) ?? 0), 0))
      const byCategory = new Map<string, number>()
      for (const tx of weekTxns) {
        const k = tx.category_name ?? ''
        byCategory.set(k, (byCategory.get(k) ?? 0) + (amountOf(tx) ?? 0))
      }
      let top: [string, number] | null = null
      for (const entry of byCategory) if (!top || entry[1] > top[1]) top = entry
      out.push({
        family: 'insight',
        kind: 'weekly_recap',
        dedupeKey: `weekly_recap:${localDay(nowUtc, tz)}`,
        priority: PRIORITY.weekly_recap,
        title: T('notif.weekly_recap_title', { amount: m(total) }),
        body:
          top && top[0]
            ? T('notif.weekly_recap_body_top', { count: weekTxns.length, category: top[0], amount: m(roundCents(top[1])) })
            : T('notif.weekly_recap_body', { count: weekTxns.length }),
        data: { screen: 'insights' },
        urgency: 'passive',
      })
    }
  }

  // ── habit: the win-backs that close the day-7 cliff ────────────────────
  //
  // Local reminders stop after seven days because the phone cannot
  // refill a schedule for an app nobody opens. These are the only
  // messages a lapsed user can still receive, so they carry a reason to
  // come back rather than a complaint about being away.
  if (input.lastLoggedAt) {
    const idleDays = daysBetween(Date.parse(input.lastLoggedAt), nowMs)
    const step = idleDays >= 60 ? 60 : idleDays >= 30 ? 30 : idleDays >= 14 ? 14 : null
    if (step) {
      const kind = `winback_${step}` as 'winback_14' | 'winback_30' | 'winback_60'
      // Lead with the bill calendar when there is one: a person who
      // stopped logging still has rent.
      const hasBills = upcoming.length > 0
      out.push({
        family: 'habit',
        kind,
        dedupeKey: `${kind}:${localDay(input.lastLoggedAt, tz)}`,
        priority: PRIORITY[kind],
        title: hasBills
          ? T('notif.winback_bills_title', { count: upcoming.length })
          : T(`notif.${kind}_title`),
        body: hasBills
          ? T('notif.winback_bills_body', { name: upcoming[0].name, amount: m(upcoming[0].amount) })
          : T(`notif.${kind}_body`),
        data: { screen: hasBills ? 'recurring' : 'record' },
        urgency: 'passive',
      })
    }
  }

  return out
}

// ─── the governor ──────────────────────────────────────────────────────────

export interface NotificationPrefs {
  receipts: boolean
  bills: boolean
  budget: boolean
  insights: boolean
  habit: boolean
  quiet_start: number
  quiet_end: number
  max_per_week: number
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  receipts: true,
  bills: true,
  budget: true,
  insights: true,
  habit: true,
  quiet_start: 22,
  quiet_end: 8,
  max_per_week: 3,
}

export interface GovernorState {
  prefs: NotificationPrefs
  /** The user's local hour, 0 to 23, from `profiles.timezone`. */
  localHour: number
  /** Claims already sent, by dedupe key. */
  alreadySent: ReadonlySet<string>
  /** Non-transactional sends in the trailing 7 days. */
  sentLast7Days: number
  /** Non-transactional sends in the user's current local day. */
  sentToday: number
}

const FAMILY_SWITCH: Record<NotificationFamily, keyof NotificationPrefs | null> = {
  receipt: 'receipts',
  bill: 'bills',
  budget: 'budget',
  insight: 'insights',
  habit: 'habit',
  money: null, // transactional, no switch
}

/** True when `hour` falls inside the quiet window, which may wrap midnight. */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

/**
 * The single message that goes out this hour, or null for silence.
 *
 * Silence is the common answer and the correct one: the sweep runs every
 * hour and most hours have nothing worth saying. Nothing here ever
 * reaches for a lower-priority candidate to fill a slot.
 */
export function govern(candidates: NotificationCandidate[], state: GovernorState): NotificationCandidate | null {
  const { prefs } = state

  const eligible = candidates.filter((c) => {
    // Said already. The claim, not the wording.
    if (state.alreadySent.has(c.dedupeKey)) return false

    // Quiet hours bind everything, including transactional messages: a
    // failed card at 03:00 is not worth waking someone, and the sweep
    // will offer it again at 08:00.
    if (inQuietHours(state.localHour, prefs.quiet_start, prefs.quiet_end)) return false

    if (c.transactional) return true

    const key = FAMILY_SWITCH[c.family]
    if (key && prefs[key] === false) return false

    // The ceilings, which only non-transactional messages answer to.
    if (state.sentToday >= 1) return false
    if (state.sentLast7Days >= prefs.max_per_week) return false
    return true
  })

  if (!eligible.length) return null
  // Highest priority wins; ties break on the family ladder implicitly,
  // because PRIORITY already encodes it.
  return eligible.reduce((best, c) => (c.priority > best.priority ? c : best))
}
