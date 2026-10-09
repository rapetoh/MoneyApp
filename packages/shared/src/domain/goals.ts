/**
 * Savings goals (migration 042, Oct 2026): progress, pace and the monthly
 * amount still needed, computed one way for the phone and the web.
 *
 * Saved is the sum of contributions (a withdrawal is a negative one), never
 * below zero. With a target date, a goal is "on track" while what is saved
 * keeps up with a straight line from the day the goal was created to its
 * date; the line is the honest default for money put aside a bit at a time.
 */
import { localParts, daysBetween } from '../utils/period'
import { roundCents } from '../utils/currency'

export interface GoalInput {
  target_amount: number
  /** Civil day (`YYYY-MM-DD`) or null. */
  target_date: string | null
  created_at: string
}

export interface GoalContributionInput {
  amount: number
}

export type GoalPace = 'done' | 'ahead' | 'on_track' | 'behind' | 'overdue' | 'no_date'

export interface GoalStatus {
  saved: number
  remaining: number
  /** 0..1, saved over target (capped at 1). */
  pct: number
  pace: GoalPace
  /** Whole days from today to the target date (0 on the day); null without a date. */
  daysLeft: number | null
  /** What to put aside each month from now to reach the target on time;
   *  null without a date, when done, or once the date has passed. */
  perMonth: number | null
}

/** Days in an average month, for "per month" from a day count. */
const DAYS_PER_MONTH = 30.4375
/** Within this share of the expected line still reads as on track. */
const PACE_TOLERANCE = 0.05

export function goalStatus(
  goal: GoalInput,
  contributions: readonly GoalContributionInput[],
  tz: string,
  nowIso: string = new Date().toISOString(),
): GoalStatus {
  const savedCents = contributions.reduce((sum, c) => sum + Math.round(c.amount * 100), 0)
  const saved = roundCents(Math.max(0, savedCents) / 100)
  const remaining = roundCents(Math.max(0, goal.target_amount - saved))
  const pct = goal.target_amount > 0 ? Math.min(1, saved / goal.target_amount) : 0

  if (remaining === 0) return { saved, remaining, pct, pace: 'done', daysLeft: daysLeftTo(goal.target_date, tz, nowIso), perMonth: null }
  if (!goal.target_date) return { saved, remaining, pct, pace: 'no_date', daysLeft: null, perMonth: null }

  const daysLeft = daysLeftTo(goal.target_date, tz, nowIso)!
  if (daysLeft < 0) return { saved, remaining, pct, pace: 'overdue', daysLeft, perMonth: null }

  const months = Math.max(1, daysLeft / DAYS_PER_MONTH)
  const perMonth = roundCents(remaining / months)

  const now = localParts(nowIso, tz)
  const start = localParts(goal.created_at, tz)
  const [ty, tm, td] = goal.target_date.split('-').map(Number)
  const totalDays = Math.max(1, daysBetween(start.y, start.m, start.d, ty, tm, td))
  const elapsed = Math.min(totalDays, Math.max(0, daysBetween(start.y, start.m, start.d, now.y, now.m, now.d)))
  const expected = goal.target_amount * (elapsed / totalDays)
  const slack = goal.target_amount * PACE_TOLERANCE
  const pace: GoalPace = saved > expected + slack ? 'ahead' : saved >= expected - slack ? 'on_track' : 'behind'

  return { saved, remaining, pct, pace, daysLeft, perMonth }
}

function daysLeftTo(targetDate: string | null, tz: string, nowIso: string): number | null {
  if (!targetDate) return null
  const [y, m, d] = targetDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const now = localParts(nowIso, tz)
  return daysBetween(now.y, now.m, now.d, y, m, d)
}
