/**
 * SyncManager — singleton that:
 * 1. Listens to network state changes
 * 2. Drains the sync queue when online (chronologically, with exponential backoff)
 * 3. Pulls remote changes from Supabase and merges them into SQLite
 */
import NetInfo, { NetInfoState } from '@react-native-community/netinfo'
import { supabase } from '../../lib/supabase'
import { getPendingEntries, removeEntry, incrementRetry, resetDeadLetterEntries } from './syncQueue'
import { upsertTransaction } from './transactionStore'
import type { Transaction } from '@voice-expense/shared'

type SyncListener = (syncing: boolean, pendingCount: number) => void

class SyncManager {
  private static instance: SyncManager
  private isOnline = false
  private isSyncing = false
  private listeners: Set<SyncListener> = new Set()
  private unsubscribeNetInfo: (() => void) | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null

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

    try {
      let hasMore = true
      while (hasMore) {
        const entries = await getPendingEntries(10)
        if (entries.length === 0) {
          hasMore = false
          break
        }

        this.notify(true, entries.length)

        for (const entry of entries) {
          try {
            const payload = JSON.parse(entry.payload)

            if (entry.operation === 'create' || entry.operation === 'update') {
              const { error } = await supabase.from('transactions').upsert(payload, {
                onConflict: 'id',
              })
              if (error) throw new Error(error.message)

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
      await upsertTransaction(row as Transaction)
    }
  }

  get online(): boolean {
    return this.isOnline
  }
}

export const syncManager = SyncManager.getInstance()
