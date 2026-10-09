/**
 * Savings goals on the phone (migration 042,
 * packages/shared/src/domain/goals.ts). Read and written straight to
 * Supabase like budgets, shared with the web, and re-read on any change
 * from another screen.
 */
import { useCallback, useEffect, useState } from 'react'
import { DeviceEventEmitter } from 'react-native'
import { supabase } from '../lib/supabase'
import { useCachedState } from '../services/queryCache'
import type { Database } from '@voice-expense/shared'

export type SavingsGoal = Database['public']['Tables']['savings_goals']['Row']
export type GoalContribution = Database['public']['Tables']['goal_contributions']['Row']

const GOALS_CHANGED = 've:goals:changed'
const emitGoals = (userId: string) => DeviceEventEmitter.emit(GOALS_CHANGED, userId)

const EMPTY: { goals: SavingsGoal[]; contributions: GoalContribution[] } = { goals: [], contributions: [] }

export function useGoals(userId: string | undefined) {
  const [data, setData, hasCached] = useCachedState(userId ? `goals:${userId}` : null, EMPTY)
  const [loading, setLoading] = useState(!hasCached)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!userId) return
    const [g, c] = await Promise.all([
      supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: true }),
      supabase.from('goal_contributions').select('*').eq('user_id', userId).order('contributed_at', { ascending: true }),
    ])
    const failure = g.error ?? c.error
    if (failure) {
      setError(failure.message)
    } else {
      setData({ goals: (g.data ?? []) as SavingsGoal[], contributions: (c.data ?? []) as GoalContribution[] })
      setError(null)
    }
    setLoading(false)
  }, [userId, setData])

  useEffect(() => {
    void fetch()
  }, [fetch])

  useEffect(() => {
    if (!userId) return
    const sub = DeviceEventEmitter.addListener(GOALS_CHANGED, (uid: string) => {
      if (uid === userId) void fetch()
    })
    return () => sub.remove()
  }, [userId, fetch])

  const after = useCallback(
    async (err: { message: string } | null) => {
      if (err || !userId) return false
      await fetch()
      emitGoals(userId)
      return true
    },
    [fetch, userId],
  )

  async function createGoal(fields: { name: string; target_amount: number; target_date: string | null; currency_code: string }) {
    if (!userId) return false
    const { error: e } = await supabase.from('savings_goals').insert({ user_id: userId, ...fields })
    return after(e)
  }

  async function updateGoal(id: string, fields: { name?: string; target_amount?: number; target_date?: string | null }) {
    if (!userId) return false
    const { error: e } = await supabase.from('savings_goals').update(fields).eq('id', id).eq('user_id', userId)
    return after(e)
  }

  /** Off the list; the goal and its history stay for exports. */
  async function archiveGoal(id: string) {
    if (!userId) return false
    const { error: e } = await supabase
      .from('savings_goals')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
    return after(e)
  }

  /** Positive puts money toward the goal, negative takes it back out. */
  async function addContribution(goalId: string, amount: number, note: string | null = null) {
    if (!userId || amount === 0) return false
    const { error: e } = await supabase
      .from('goal_contributions')
      .insert({ goal_id: goalId, user_id: userId, amount, note })
    return after(e)
  }

  return {
    goals: data.goals,
    contributions: data.contributions,
    loading,
    error,
    refetch: fetch,
    createGoal,
    updateGoal,
    archiveGoal,
    addContribution,
  }
}
