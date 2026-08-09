import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getTransactions, upsertTransaction, softDeleteTransaction, updateTransactionFields } from '../services/sync/transactionStore'
import { enqueue } from '../services/sync/syncQueue'
import { syncManager } from '../services/sync/SyncManager'
import { DataEvents } from '../events/dataEvents'
import type { Transaction } from '@voice-expense/shared'
import { snapshotFx, aggAmount } from '@voice-expense/shared'
import * as Crypto from 'expo-crypto'
import { getCurrentProfileCurrency } from '../services/profileCurrency'

export function useTransactions(userId: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lastSyncedAt = useRef<string | undefined>(undefined)

  const loadLocal = useCallback(async () => {
    if (!userId) return
    const local = await getTransactions(userId)
    setTransactions(local)
    setLoading(false)
  }, [userId])

  // Initial load: read SQLite immediately, then pull remote
  useEffect(() => {
    if (!userId) return

    setLoading(true)
    loadLocal().then(() => {
      syncManager.pullRemote(userId, lastSyncedAt.current).then(() => {
        lastSyncedAt.current = new Date().toISOString()
        loadLocal()
      })
    })
  }, [userId, loadLocal])

  // Cross-screen sync: when another hook instance writes, reload immediately
  useEffect(() => {
    if (!userId) return
    return DataEvents.onTransactions(userId, loadLocal)
  }, [userId, loadLocal])

  // Realtime: when Supabase pushes a change, upsert into SQLite then reload.
  // Channel name includes a unique ID so React Strict Mode's double-invoke never hits
  // the same channel instance — each effect run gets a fresh subscription.
  useEffect(() => {
    if (!userId) return

    const channelName = `transactions:${userId}:${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            await upsertTransaction(payload.new as Transaction)
          }
          await loadLocal()
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [userId]) // loadLocal is stable per userId — not needed as a separate dep

  async function createTransaction(
    fields: Pick<Transaction, 'amount' | 'direction' | 'currency_code' | 'merchant' | 'note' | 'category_id' | 'payment_method'> &
      Partial<Pick<Transaction, 'source' | 'raw_transcript' | 'ai_confidence' | 'is_recurring' | 'recurring_rule_id' | 'recurring_frequency' | 'merchant_domain'>>,
  ): Promise<{ id: string | null; error: string | null }> {
    if (!userId) return { id: null, error: 'Not authenticated' }

    const now = new Date().toISOString()
    const clientId = Crypto.randomUUID()

    // FX snapshot (migration 011). Same-currency → 1.0 short-circuits
    // without a network call. Different currency → frankfurter.app
    // lookup; on failure the row saves without the snapshot and gets
    // picked up by the backfill sweep on next online launch.
    const profileCurrency = getCurrentProfileCurrency()
    const fx = await snapshotFx(now, fields.currency_code, profileCurrency, fields.amount)

    const txn: Transaction = {
      id: clientId,
      user_id: userId,
      amount: fields.amount,
      direction: fields.direction,
      currency_code: fields.currency_code,
      category_id: fields.category_id,
      merchant: fields.merchant,
      merchant_domain: fields.merchant_domain ?? null,
      note: fields.note,
      payment_method: fields.payment_method,
      amount_in_profile_currency: fx?.amount_in_profile_currency ?? null,
      fx_rate_to_profile: fx?.fx_rate_to_profile ?? null,
      fx_rate_date: fx?.fx_rate_date ?? null,
      transacted_at: now,
      source: fields.source ?? 'manual',
      raw_transcript: fields.raw_transcript ?? null,
      ai_confidence: fields.ai_confidence ?? null,
      is_recurring: fields.is_recurring ?? false,
      recurring_rule_id: fields.recurring_rule_id ?? null,
      recurring_frequency: fields.is_recurring ? (fields.recurring_frequency ?? 'monthly') : null,
      client_id: clientId,
      client_created_at: now,
      version: 1,
      is_deleted: false,
      deleted_at: null,
      synced_at: null,
      created_at: now,
      updated_at: now,
    }

    // Write to SQLite immediately (optimistic)
    await upsertTransaction(txn)
    await loadLocal()
    DataEvents.emitTransactions(userId)

    // Queue for Supabase sync
    await enqueue('create', txn.id, txn)
    syncManager.drainQueue()

    return { id: clientId, error: null }
  }

  async function deleteTransaction(id: string): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Not authenticated' }

    await softDeleteTransaction(id)
    await loadLocal()
    DataEvents.emitTransactions(userId)

    const txn = transactions.find((t) => t.id === id)
    if (txn) {
      await enqueue('delete', id, {
        id,
        user_id: userId,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        version: (txn.version ?? 1) + 1,
      })
      syncManager.drainQueue()
    }

    return { error: null }
  }

  async function editTransaction(
    id: string,
    fields: Partial<Pick<Transaction, 'amount' | 'merchant' | 'note' | 'category_id' | 'payment_method' | 'direction' | 'is_recurring' | 'recurring_frequency'>>,
  ): Promise<{ error: string | null }> {
    if (!userId) return { error: 'Not authenticated' }

    await updateTransactionFields(id, fields)

    // If the amount changed, the FX snapshot is now stale. Reuse the
    // row's existing `fx_rate_to_profile` (the rate is dated to the
    // transaction's transacted_at — that day doesn't change) and
    // recompute the converted amount in place. No network call.
    // When the row has no snapshot yet (foreign-currency historical
    // row awaiting backfill), we leave the snapshot null and let the
    // backfill pick it up.
    if (fields.amount != null) {
      const store = await import('../services/sync/transactionStore')
      const row = await store.getTransactionById(id)
      if (row?.fx_rate_to_profile != null) {
        await store.updateAmountSnapshot(
          id,
          Math.round(fields.amount * row.fx_rate_to_profile * 100) / 100,
        )
      }
    }

    await loadLocal()
    DataEvents.emitTransactions(userId)

    const updated = await import('../services/sync/transactionStore').then((m) =>
      m.getTransactionById(id),
    )
    if (updated) {
      await enqueue('update', id, updated)
      syncManager.drainQueue()
    }

    return { error: null }
  }

  return { transactions, loading, error, createTransaction, deleteTransaction, editTransaction }
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
    .reduce((sum, t) => sum + aggAmount(t), 0)

  const totalExpenses = monthTxns
    .filter((t) => t.direction === 'debit')
    .reduce((sum, t) => sum + aggAmount(t), 0)

  const netBalance = totalIncome - totalExpenses

  return { totalIncome, totalExpenses, netBalance, monthTxns }
}
