import { useEffect, useState, useCallback } from 'react'
import { getCalendars } from 'expo-localization'
import { getTransactions, upsertTransaction, softDeleteTransaction, updateTransactionFields, getTransactionById } from '../services/sync/transactionStore'
import { enqueue } from '../services/sync/syncQueue'
import { syncManager, type OutboxOutcome } from '../services/sync/SyncManager'
import { DataEvents } from '../events/dataEvents'
import type { Transaction } from '@voice-expense/shared'
import { snapshotFx, aggAmount, localDay } from '@voice-expense/shared'
import { validateTransactionWriteFields } from '@voice-expense/ai'
import * as Crypto from 'expo-crypto'
import { getCurrentProfileCurrency } from '../services/profileCurrency'

/** IANA zone the device is currently in. Mirrors `useProfile.ts`'s own
 *  `getDeviceTimeZone` (fix-plan 1.3 part 1 — that hook keeps
 *  `profiles.timezone` synced to this same source on every launch) so
 *  `local_day` below is computed from the same zone the stored profile
 *  is converging on, without this file needing to read profile state it
 *  isn't otherwise threaded. Falls back to 'UTC' — matching the column
 *  default — on a platform/runtime that can't answer. */
function getDeviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

/** What a mutation actually did, truthfully — fix-plan 1.6 point 1. Every
 *  call site used to get `{ error: null }` unconditionally: 'Not
 *  authenticated' was the only error this could ever produce, so every
 *  `if (error)` check downstream was dead code. `status` distinguishes
 *  "reached the server" from "queued because the device is offline" from
 *  "the server permanently rejected this" — the last one is the one a
 *  caller must not treat as a successful save. */
export interface MutationResult {
  id: string | null
  status: OutboxOutcome
  error: string | null
}

/**
 * Soft-deletes a transaction locally and enqueues the sync delete —
 * extracted as a plain function, not a hook, so it never depends on any
 * particular `useTransactions()` instance's React state. The old inline
 * version read the row to delete from `transactions`, that render's stale
 * closure, and skipped the enqueue entirely when the row wasn't in it (a
 * different screen's instance, or a row that arrived after the last
 * `loadLocal`) — the row was soft-deleted in SQLite but the delete never
 * reached the outbox, so it reappeared on the next `pullRemote` or
 * persisted on the server forever (audit 07-F32). Always re-reading the
 * row from SQLite — the single local source of truth — after the
 * soft-delete makes the enqueue unconditional whenever the row exists
 * locally at all, and also removes a second, redundant version increment
 * (`softDeleteTransaction` already bumped it).
 */
export async function deleteTransactionAndEnqueue(userId: string, id: string): Promise<MutationResult> {
  await softDeleteTransaction(id)
  const deleted = await getTransactionById(id)
  if (!deleted) return { id, status: 'synced', error: null } // nothing to delete — id never existed locally

  await enqueue(
    'delete',
    id,
    {
      id,
      user_id: userId,
      is_deleted: true,
      deleted_at: deleted.deleted_at,
      version: deleted.version,
    },
    'transaction',
  )
  const outcome = await syncManager.awaitOutcome(id)
  return { id, status: outcome.status, error: outcome.error }
}

export function useTransactions(userId: string | undefined) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLocal = useCallback(async () => {
    if (!userId) return
    const local = await getTransactions(userId)
    setTransactions(local)
    setLoading(false)
  }, [userId])

  // Initial load: read SQLite immediately, then pull remote. `pullRemote`
  // and the realtime channel below are owned by SyncManager as a single
  // per-user singleton (fix-plan 1.6 point 8) — calling them from every
  // mounted `useTransactions()` instance is safe and cheap, since both
  // are idempotent per user and only the first caller actually does
  // network work; every instance still gets its own SQLite read via
  // `loadLocal` and the `DataEvents` listener below.
  useEffect(() => {
    if (!userId) return

    setLoading(true)
    syncManager.startRealtime(userId)
    loadLocal().then(() => {
      syncManager.pullRemote(userId).then(() => {
        loadLocal()
      })
    })
  }, [userId, loadLocal])

  // Cross-screen sync: when another hook instance (or SyncManager's
  // realtime handler) writes, reload immediately.
  useEffect(() => {
    if (!userId) return
    return DataEvents.onTransactions(userId, loadLocal)
  }, [userId, loadLocal])

  async function createTransaction(
    fields: Pick<Transaction, 'amount' | 'direction' | 'currency_code' | 'merchant' | 'note' | 'category_id' | 'payment_method'> &
      Partial<Pick<Transaction, 'source' | 'raw_transcript' | 'ai_confidence' | 'is_recurring' | 'recurring_rule_id' | 'recurring_frequency' | 'merchant_domain'>>,
  ): Promise<MutationResult> {
    if (!userId) return { id: null, status: 'rejected', error: 'Not authenticated' }

    // Third boundary of the typed parse boundary (fix-plan item 1.7) —
    // createTransaction is the last line of defence and must refuse to
    // write a row that cannot sync, regardless of whether `fields` came
    // from a validated AI parse, a shortcut deep link, the notification
    // listener, or manual entry. A `currency_code` or `payment_method`
    // that would fail the DB's CHECK constraint is caught here, before a
    // single row is written to SQLite — not after it fails to sync forever.
    const writeErrors = validateTransactionWriteFields({
      amount: fields.amount,
      direction: fields.direction,
      currency_code: fields.currency_code,
      payment_method: fields.payment_method,
    })
    if (writeErrors) {
      return {
        id: null,
        status: 'rejected',
        error: writeErrors.map((e) => `${e.field} — ${e.message}`).join('; '),
      }
    }

    const now = new Date().toISOString()
    const clientId = Crypto.randomUUID()

    // Same zone for both the FX snapshot's rate date and `local_day`
    // below — computed once so the two can't disagree about which civil
    // day this transaction belongs to.
    const tz = getDeviceTimeZone()

    // FX snapshot (migration 011). Same-currency → 1.0 short-circuits
    // without a network call. Different currency → frankfurter.app
    // lookup; on failure the row saves without the snapshot and gets
    // picked up by the backfill sweep on next online launch. `tz`
    // (fix-plan 1.3 part 2 adoption, `fx.ts:79`) dates the rate to the
    // *civil* day the transaction belongs to, not a bare UTC slice.
    const profileCurrency = getCurrentProfileCurrency()
    const fx = await snapshotFx(now, fields.currency_code, profileCurrency, fields.amount, tz)

    // transactions.local_day (migration 017, NOT NULL) — the civil day
    // this transaction belongs to in the user's zone, resolved once here
    // at create time and never recomputed by a reader (fix-plan 1.3 part
    // 3). Not part of the local SQLite manifest yet (Stage 2 adoption for
    // reads — `transactionStore.ts`'s `rowToTransaction` recomputes it
    // from `transacted_at` on the way back out instead), so this is the
    // one true answer: it rides both the local `Transaction` object below
    // and the sync payload, and `sync_upsert_transaction` (migration 018)
    // writes the client's own answer instead of falling back to its
    // server-side recompute.
    const localDayValue = localDay(now, tz)

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
      local_day: localDayValue,
      // Resolved by `upsertTransaction` from `transacted_at` on write,
      // same as every other local writer — see its docstring.
      occurrence_date: null,
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

    // Queue for Supabase sync and await the first drain attempt (bounded
    // by a short timeout) so the caller can tell a permanent rejection
    // from "queued, will sync once online" — the row already saved
    // locally either way; only 'rejected' means the server will never
    // accept this payload as-is.
    await enqueue('create', txn.id, txn, 'transaction')
    const outcome = await syncManager.awaitOutcome(txn.id)

    return { id: clientId, status: outcome.status, error: outcome.error }
  }

  async function deleteTransaction(id: string): Promise<MutationResult> {
    if (!userId) return { id, status: 'rejected', error: 'Not authenticated' }

    const result = await deleteTransactionAndEnqueue(userId, id)
    await loadLocal()
    DataEvents.emitTransactions(userId)
    return result
  }

  async function editTransaction(
    id: string,
    fields: Partial<Pick<Transaction, 'amount' | 'merchant' | 'note' | 'category_id' | 'payment_method' | 'direction' | 'is_recurring' | 'recurring_frequency'>>,
  ): Promise<MutationResult> {
    if (!userId) return { id, status: 'rejected', error: 'Not authenticated' }

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
    if (!updated) return { id, status: 'synced', error: null }

    await enqueue('update', id, updated, 'transaction')
    const outcome = await syncManager.awaitOutcome(id)
    return { id, status: outcome.status, error: outcome.error }
  }

  return { transactions, loading, error, createTransaction, deleteTransaction, editTransaction }
}

// Current month summary
export function useMonthSummary(transactions: Transaction[]) {
  const now = new Date()
  // Stage 2 (2.4/2.14) migration pending: device-local month boundary,
  // not `period.ts`'s `monthBounds(monthIso(now, tz), tz)`. This hook has
  // no `tz` threaded in (it only receives `transactions`) and, unlike
  // `createTransaction` above, is unreferenced anywhere in the app today
  // — left as explicit debt rather than migrated speculatively without a
  // real caller to verify the zone-aware behaviour against.
  // eslint-disable-next-line local/period-restrictions
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
