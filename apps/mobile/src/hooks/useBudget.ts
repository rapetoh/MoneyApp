import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { DataEvents } from '../events/dataEvents'
import type { Budget, BudgetPeriod } from '@voice-expense/shared'

export function useActiveBudget(userId: string | undefined) {
  const [budget, setBudget] = useState<Budget | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('category_id', null) // overall budget, not per-category
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setBudget(data as Budget | null)
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

  async function setBudget_(amount: number, period: BudgetPeriod, currency: string) {
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
      amount,
      period,
      currency_code: currency,
      category_id: null,
      is_active: true,
    })

    if (!error) {
      await fetch()
      DataEvents.emitBudget(userId)
    }
    return !error
  }

  return { budget, loading, setBudget: setBudget_, refetch: fetch }
}

// Backwards-compatible alias used by HomeScreen + SafeToSpend
export const useMonthlyBudget = useActiveBudget

/**
 * Returns the amount spent in the current period matching the budget's period.
 * Weekly: current Mon–Sun. Biweekly: last 14 days. Monthly: calendar month.
 */
export function usePeriodSpend(
  budget: Budget | null,
  transactions: { amount: number; direction: string; transacted_at: string; is_deleted: boolean }[],
) {
  if (!budget) return 0

  const now = new Date()
  let periodStart: Date

  if (budget.period === 'weekly') {
    const day = now.getDay() // 0=Sun, 1=Mon...
    const diff = (day === 0 ? 6 : day - 1) // days since Monday
    periodStart = new Date(now)
    periodStart.setDate(now.getDate() - diff)
    periodStart.setHours(0, 0, 0, 0)
  } else if (budget.period === 'biweekly') {
    periodStart = new Date(now)
    periodStart.setDate(now.getDate() - 13)
    periodStart.setHours(0, 0, 0, 0)
  } else {
    // monthly (default) and others
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  }

  return transactions
    .filter(
      (t) =>
        !t.is_deleted &&
        t.direction === 'debit' &&
        new Date(t.transacted_at) >= periodStart,
    )
    .reduce((sum, t) => sum + t.amount, 0)
}
