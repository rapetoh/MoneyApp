import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Budget } from '@voice-expense/shared'

export function useMonthlyBudget(userId: string | undefined) {
  const [budget, setBudget] = useState<Budget | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('period', 'monthly')
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

  async function setMonthlyBudget(amount: number, currency: string = 'USD') {
    if (!userId) return false

    if (budget) {
      // Deactivate current budget
      await supabase.from('budgets').update({ is_active: false }).eq('id', budget.id)
    }

    const { error } = await supabase.from('budgets').insert({
      user_id: userId,
      amount,
      period: 'monthly',
      currency_code: currency,
      category_id: null,
      is_active: true,
    })

    if (!error) await fetch()
    return !error
  }

  return { budget, loading, setMonthlyBudget, refetch: fetch }
}
