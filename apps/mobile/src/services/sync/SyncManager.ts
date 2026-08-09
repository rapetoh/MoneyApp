/**
 * SyncManager — singleton that:
 * 1. Listens to network state changes
 * 2. Drains the sync queue when online (chronologically, with exponential backoff)
 * 3. Pulls remote changes from Supabase and merges them into SQLite
 */
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import { supabase } from '../../lib/supabase'
import { getPendingEntries, removeEntry, incrementRetry, resetDeadLetterEntries } from './syncQueue'
import { upsertTransaction, softDeleteTransaction } from './transactionStore'
import type { Transaction } from '@voice-expense/shared'

// Recurring-generated dedup conflict — see migration 008. Postgres returns
// SQLSTATE 23505 with an `idx_txn_recurring_dedup` mention when two writers
// produce the same (rule, date) occurrence. Supabase surfaces the Postgrest
// error with `.code` and a `.message` substring; we accept either signal
// so a future name change to the index doesn't silently regress this path.
function isRecurringDedupConflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return Boolean(error.message?.includes('idx_txn_recurring_dedup'))
}

type SyncListener = (syncing: boolean, pendingCount: number) => void

class SyncManager {
  private static instance: SyncManager
  private isOnline = false
  private isSyncing = false
  private listeners: Set<SyncListener> = new Set()
  private unsubscribeNetInfo: (() => void) | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  // Bumped by stop(). drainQueue() and pullRemote() capture the value on
  // entry and re-check it after every await, so a stop() issued mid-flight
  // (the sign-out teardown) halts them instead of letting the old
  // account's queue entries fire or its rows merge back into a wiped DB.
  private drainEpoch = 0

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager()
    }
    return SyncManager.instance
  }

  start(): void {
    if (this.unsubscribeNetInfo) return // already started
    // Reset any previously dead-lettered entries — they may have failed due to a
    // transient bug (e.g. missing unique constraint). Give them a fresh chance.
    resetDeadLetterEntries().catch(() => {})
    this.unsubscribeNetInfo = NetInfo.addEventListener(this.handleNetworkChange)
    // Check current state immediately
    NetInfo.fetch().then(this.handleNetworkChange)
  }

  stop(): void {
    this.unsubscribeNetInfo?.()
    this.unsubscribeNetInfo = null
    this.drainEpoch += 1
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  addListener(listener: SyncListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(syncing: boolean, pendingCount: number): void {
    this.listeners.forEach((l) => l(syncing, pendingCount))
  }

  private handleNetworkChange = (state: NetInfoState): void => {
    const wasOffline = !this.isOnline
    this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false)
    if (this.isOnline && wasOffline) {
      this.drainQueue()
    }
  }

  async drainQueue(): Promise<void> {
    if (!this.isOnline || this.isSyncing) return
    this.isSyncing = true
    const epoch = this.drainEpoch

    try {
      let hasMore = true
      while (hasMore && epoch === this.drainEpoch) {
        const entries = await getPendingEntries(10)
        if (entries.length === 0) {
          hasMore = false
          break
        }

        this.notify(true, entries.length)

        for (const entry of entries) {
          if (epoch !== this.drainEpoch) return
          try {
            const payload = JSON.parse(entry.payload)

            if (entry.operation === 'create' || entry.operation === 'update') {
              // raw_transcript stays local-only — the Privacy screen
              // promises "voice not stored" and the schema comment in
              // 001_initial_schema.sql says the column is "stored
              // locally only". Stripping here keeps that promise. The
              // upsert's ON CONFLICT SET in transactionStore.ts does not
              // touch raw_transcript, so a later pullRemote bringing back
              // the null-transcript server row will not overwrite the
              // local copy on the recording device.
              const { raw_transcript: _stripped, ...serverPayload } = payload
              const { error } = await supabase.from('transactions').upsert(serverPayload, {
                onConflict: 'id',
              })
              if (error) {
                // 23505 on the recurring-dedup index means another writer
                // (the server cron, or this device on a prior launch)
                // already created the same recurring occurrence. The local
                // row is the loser of the race — soft-delete it locally so
                // SQLite matches the server's view, then drop the queue
                // entry. Without this branch the retry counter would tick
                // forever because the violation is permanent.
                if (isRecurringDedupConflict(error)) {
                  await softDeleteTransaction(payload.id)
                  await removeEntry(entry.id)
                  continue
                }
                throw new Error(error.message)
              }

              // A stop() during the network await means the local DB may
              // just have been wiped — writing the synced copy back would
              // resurrect the old account's row.
              if (epoch !== this.drainEpoch) return

              // Mark as synced in local DB
              await upsertTransaction({ ...payload, synced_at: new Date().toISOString() })
            } else if (entry.operation === 'delete') {
              const { error } = await supabase
                .from('transactions')
                .update({ is_deleted: true, deleted_at: payload.deleted_at, version: payload.version })
                .eq('id', payload.id)
                .eq('user_id', payload.user_id)
              if (error) throw new Error(error.message)
            }

            await removeEntry(entry.id)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await incrementRetry(entry.id, message)
            // Stop draining on error — will retry next time we go online
            hasMore = false
            break
          }
        }
      }
    } finally {
      this.isSyncing = false
      this.notify(false, 0)
    }
  }

  /**
   * Pull all transactions for a user from Supabase and merge into SQLite.
   * Called on app start and after a long offline period.
   */
  async pullRemote(userId: string, since?: string): Promise<void> {
    if (!this.isOnline) return
    const epoch = this.drainEpoch

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(200)

    if (since) {
      query = query.gt('updated_at', since)
    }

    const { data, error } = await query
    if (error || !data) return

    for (const row of data) {
      // A stop() (sign-out teardown) while the fetch or a prior upsert
      // was in flight — do not merge the old account's rows back into a
      // freshly wiped DB.
      if (epoch !== this.drainEpoch) return
      await upsertTransaction(row as Transaction)
    }
  }

  get online(): boolean {
    return this.isOnline
  }
}

export const syncManager = SyncManager.getInstance()
