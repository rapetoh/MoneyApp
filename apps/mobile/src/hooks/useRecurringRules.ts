import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'

// ─── Period bounds ────────────────────────────────────────────────────────────

function getPeriodBounds(period: BudgetPeriod | undefined, now: Date): { start: Date; end: Date } {
  const start = new Date(now)
  const end = new Date(now)

  switch (period) {
    case 'weekly':
      const day = start.getDay()
      start.setDate(start.getDate() - day)
      end.setDate(start.getDate() + 6)
      break
    case 'biweekly':
      start.setDate(start.getDate() - 13)
      break
    case 'quarterly':
      const q = Math.floor(start.getMonth() / 3)
      start.setMonth(q * 3, 1)
      end.setMonth(q * 3 + 3, 0)
      break
    case 'yearly':
      start.setMonth(0, 1)
      end.setMonth(11, 31)
      break
    default: // monthly
      start.setDate(1)
      end.setMonth(end.getMonth() + 1, 0)
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// ─── Next occurrence ──────────────────────────────────────────────────────────

export function computeNextOccurrence(rule: RecurringRule): Date | null {
  const base = rule.last_generated
    ? new Date(rule.last_generated)
    : new Date(rule.starts_at)

  const next = new Date(base)

  switch (rule.frequency) {
    case 'daily':     next.setDate(next.getDate() + rule.interval); break
    case 'weekly':    next.setDate(next.getDate() + 7 * rule.interval); break
    case 'biweekly':  next.setDate(next.getDate() + 14 * rule.interval); break
    case 'monthly':   next.setMonth(next.getMonth() + rule.interval); break
    case 'quarterly': next.setMonth(next.getMonth() + 3 * rule.interval); break
    case 'yearly':    next.setFullYear(next.getFullYear() + rule.interval); break
  }

  if (rule.ends_at && next > new Date(rule.ends_at)) return null
  return next
}

// ─── Upcoming amount for Safe to Spend ───────────────────────────────────────

export function computeUpcomingRecurring(
  rules: RecurringRule[],
  period: BudgetPeriod | undefined,
): number {
  const now = new Date()
  const { start, end } = getPeriodBounds(period, now)

  return rules
    .filter((r) => r.is_active)
    .reduce((sum, rule) => {
      const next = computeNextOccurrence(rule)
      if (!next) return sum
      if (next >= start && next <= end) return sum + rule.amount
      return sum
    }, 0)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecurringRules(userId: string | undefined) {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('recurring_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setRules((data as RecurringRule[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  async function createRule(params: {
    name: string | null
    amount: number
    currency_code: string
    category_id: string | null
    direction: 'debit' | 'credit'
    payment_method: string | null
    note: string | null
    frequency: RecurringFrequency
    template_txn_id?: string | null
  }): Promise<RecurringRule | null> {
    if (!userId) return null
    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        name: params.name,
        amount: params.amount,
        currency_code: params.currency_code,
        category_id: params.category_id,
        direction: params.direction,
        payment_method: params.payment_method,
        note: params.note,
        frequency: params.frequency,
        interval: 1,
        starts_at: new Date().toISOString(),
        last_generated: new Date().toISOString(), // treat creation as first generation
        template_txn_id: params.template_txn_id ?? null,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      // Previously silent — the onboarding income step relied on this
      // returning a rule and had no visibility when it didn't. A warn
      // makes the failure loud enough to notice in dev without breaking
      // production.
      console.warn('[useRecurringRules] createRule failed:', error)
      return null
    }
    await fetch()
    return data as RecurringRule
  }

  async function toggleRule(id: string, isActive: boolean) {
    await supabase.from('recurring_rules').update({ is_active: isActive }).eq('id', id)
    await fetch()
  }

  async function deleteRule(id: string) {
    await supabase.from('recurring_rules').delete().eq('id', id)
    await fetch()
  }

  async function updateRule(
    id: string,
    changes: Partial<
      Pick<
        RecurringRule,
        | 'frequency'
        | 'amount'
        | 'name'
        | 'ends_at'
        | 'category_id'
        | 'direction'
        | 'payment_method'
        | 'note'
      >
    >,
  ) {
    await supabase.from('recurring_rules').update(changes).eq('id', id)
    await fetch()
  }

  return { rules, loading, createRule, toggleRule, deleteRule, updateRule, refetch: fetch }
}
