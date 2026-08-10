import { useEffect, useState, useCallback } from 'react'
import * as Crypto from 'expo-crypto'
import { getCalendars } from 'expo-localization'
import { supabase } from '../lib/supabase'
import { DataEvents } from '../events/dataEvents'
import { aggAmount, periodBounds, budgetStatus, localDay } from '@voice-expense/shared'
import type {
  Budget,
  BudgetPeriod,
  BudgetStatus,
  BudgetStatusRule,
  BudgetStatusTransaction,
} from '@voice-expense/shared'

/** Best-effort device zone for callers that don't have `profile.
 *  timezone` threaded through yet — same fallback, same rationale, as
 *  `useRecurringRules.ts`'s `deviceTimeZone()` (fix-plan 1.3's "a zone,
 *  consistently applied" note): a device-local zone the whole window
 *  computation agrees on beats the previous code, which had no zone
 *  concept at all and did its arithmetic in whatever the JS runtime's
 *  own local zone happened to be. Callers that have `profile.timezone`
 *  (`apps/mobile/app/(tabs)/budgets.tsx`) pass it explicitly instead. */
function deviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

export function useActiveBudget(userId: string | undefined) {
  const [budget, setBudget] = useState<Budget | null>(null)
  const [loading, setLoading] = useState(true)
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family): this fetch
  // used to discard `error` entirely, so a failed read rendered exactly
  // like "no budget set" (the app's actual empty state) everywhere this
  // hook is consumed. The prior `budget` is left in place on a failed
  // read rather than cleared, and `error` is exposed so a caller can
  // render a real error state with retry instead of the false empty one.
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data, error: fetchError } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('category_id', null) // overall budget, not per-category
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setBudget(data as Budget | null)
      setError(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetch()
  }, [fetch])

  // Reload when another screen updates the budget
  useEffect(() => {
    if (!userId) return
    return DataEvents.onBudget(userId, fetch)
  }, [userId, fetch])

  async function setBudget_(
    amount: number,
    period: BudgetPeriod,
    currency: string,
    tz: string = deviceTimeZone(),
  ) {
    if (!userId) return false

    // Deactivate any existing active overall budget
    await supabase
      .from('budgets')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('category_id', null)

    const { error } = await supabase.from('budgets').insert({
      user_id: userId,
      client_id: Crypto.randomUUID(),
      amount,
      period,
      currency_code: currency,
      category_id: null,
      is_active: true,
      // Anchors a biweekly cycle's phase to the civil day the budget was
      // created on, in the owning profile's own zone — fix-plan 2.5 (the
      // DB default `CURRENT_DATE` is Postgres's server date, i.e. UTC,
      // which can be a day off from the user's own "today").
      starts_at: localDay(new Date().toISOString(), tz),
    })

    if (!error) {
      await fetch()
      DataEvents.emitBudget(userId)
    }
    return !error
  }

  return { budget, loading, error, setBudget: setBudget_, refetch: fetch }
}

// Backwards-compatible alias used by HomeScreen + SafeToSpend
export const useMonthlyBudget = useActiveBudget

/**
 * Amount spent in `budget`'s own period window, ending "now" — the
 * half-open `[start, endExclusive)` bound from `periodBounds()`
 * (`packages/shared/src/utils/period.ts`, fix-plan 1.3), anchored on
 * `budget.starts_at` rather than "now" itself, exhaustively switched
 * over all five `BudgetPeriod` values. Before this, the branch list
 * ended at `biweekly` and fell into an `else` comment reading "monthly
 * (default) and others" — a quarterly or yearly budget silently read
 * a calendar-month window here while its own header said QUARTERLY —
 * and every window had a start with no end, so a transaction dated any
 * number of days in the future counted against the current period.
 *
 * Returns spend only (no recurring "committed" outflow) so existing
 * 2-argument call sites this item doesn't own (`app/(tabs)/index.tsx`)
 * keep compiling and keep their own separate recurring math untouched;
 * `budgetStatusFor()` below is the full `{spent, committed, remaining,
 * pct}` breakdown for callers that have the rules to feed it.
 */
export function usePeriodSpend(
  budget: Budget | null,
  transactions: {
    amount: number
    amount_in_profile_currency: number | null
    direction: string
    transacted_at: string
    is_deleted: boolean
  }[],
  tz: string = deviceTimeZone(),
): number {
  if (!budget) return 0
  const anchor = budget.starts_at
  const window = periodBounds(budget.period, new Date().toISOString(), tz, anchor)
  return transactions
    .filter(
      (t) =>
        !t.is_deleted &&
        t.direction === 'debit' &&
        t.transacted_at >= window.start &&
        t.transacted_at < window.endExclusive,
    )
    .reduce((sum, t) => sum + aggAmount(t), 0)
}

/**
 * The full budget-status breakdown — `{spent, committed, remaining,
 * pct}` — for a caller that has the user's recurring rules on hand
 * (`apps/mobile/app/(tabs)/budgets.tsx`). Thin wrapper over the one
 * shared implementation (`packages/shared/src/domain/budget.ts`,
 * fix-plan 2.5) so mobile and web can never compute two different
 * numbers for the same budget again.
 */
export function budgetStatusFor(
  budget: Budget | null,
  transactions: readonly BudgetStatusTransaction[],
  rules: readonly BudgetStatusRule[],
  tz: string,
): BudgetStatus | null {
  if (!budget) return null
  return budgetStatus(
    {
      period: budget.period,
      starts_at: budget.starts_at,
      category_id: budget.category_id,
      currency_code: budget.currency_code,
      amount: budget.amount,
    },
    transactions,
    rules,
    tz,
  )
}
