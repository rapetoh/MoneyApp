import { useEffect, useState, useCallback } from 'react'
import * as Crypto from 'expo-crypto'
import { getCalendars } from 'expo-localization'
import { supabase } from '../lib/supabase'
import { DataEvents } from '../events/dataEvents'
import { useCachedState } from '../services/queryCache'
import { budgetStatus, localDay } from '@voice-expense/shared'
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
  // Shared, process-lifetime value (src/services/queryCache.ts) — see
  // useCategories for why every data hook reads through it.
  const [budget, setBudget, hasCached] = useCachedState<Budget | null>(
    userId ? `budget:${userId}` : null,
    null,
  )
  const [loading, setLoading] = useState(!hasCached)
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
