import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction } from '@voice-expense/shared'

export function useTransactions(userId: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTransactions = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('transacted_at', { ascending: false })
      .limit(200)

    if (error) {
      setError(error.message)
    } else {
      setTransactions((data as Transaction[]) ?? [])
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // Realtime subscription
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`transactions:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Re-fetch on any change
          fetchTransactions()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, fetchTransactions])

  return { transactions, loading, error, refetch: fetchTransactions }
}

// Current month summary
export function useMonthSummary(transactions: Transaction[]) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const monthTxns = transactions.filter(
    (t) => t.transacted_at >= startOfMonth && !t.is_deleted,
  )

  const totalIncome = monthTxns
    .filter((t) => t.direction === 'credit')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = monthTxns
    .filter((t) => t.direction === 'debit')
    .reduce((sum, t) => sum + t.amount, 0)

  const netBalance = totalIncome - totalExpenses

  return { totalIncome, totalExpenses, netBalance, monthTxns }
}
