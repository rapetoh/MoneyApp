/**
 * SyncManager — the outbox. Owns:
 * 1. Network + app-foreground state, driving when the queue drains.
 * 2. Draining `sync_queue` in insertion order (`id ASC`), across every
 *    entity type, isolating a poisoned entry instead of blocking every
 *    healthy entry behind it, and scheduling a real backoff retry for
 *    transient failures.
 * 3. Pulling remote changes into SQLite, paginated and cursor-persisted,
 *    for every entity type.
 * 4. One realtime channel per signed-in user, shared by every mounted
 *    `useTransactions()` instance instead of one channel each.
 *
 * Fix-plan 1.6 ("An outbox that can report failure, and an entity-complete
 * offline layer"). See `docs/audit-2026-08-08/10-FIX-PLAN.md` item 1.6 for
 * the full spec this rebuild is against.
 */
import NetInfo from '@react-native-community/netinfo'
import type { NetInfoState } from '@react-native-community/netinfo'
import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { supabaseAny } from './untypedClient'
import {
  getReadyBatch,
  markSynced,
  markTransientFailure,
  markDeadLetter,
  getPendingCount,
  getDeadCount,
  getNextScheduledAttempt,
  getLatestEntryForEntity,
  type QueueEntry,
} from './syncQueue'
import { classifyError } from './retryPolicy'
import { paginateAscending, type PageResult } from './pagination'
import { getSyncCursor, setSyncCursor } from './localDb'
import { softDeleteTransaction } from './transactionStore'
import { ENTITY_HANDLERS } from './entityRegistry'
import { touchDeviceSynced } from './deviceRegistry'
import { DataEvents } from '../../events/dataEvents'
import type { SyncEntityType } from '@voice-expense/shared'

const ENTITY_TYPES: readonly SyncEntityType[] = ['transaction', 'category', 'budget', 'recurring_rule']
const DRAIN_BATCH_SIZE = 10
const PULL_PAGE_SIZE = 500
const REALTIME_TABLES: Record<SyncEntityType, string> = {
  transaction: 'transactions',
  category: 'categories',
  budget: 'budgets',
  recurring_rule: 'recurring_rules',
}

export type SyncListener = (syncing: boolean, pendingCount: number, deadCount: number) => void
export type OutboxOutcome = 'synced' | 'rejected' | 'queued'

class SyncManager {
  private static instance: SyncManager

  private isOnline = false
  private isSyncing = false
  private listeners: Set<SyncListener> = new Set()
  private unsubscribeNetInfo: (() => void) | null = null
  private unsubscribeAppState: (() => void) | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private realtimeChannel: RealtimeChannel | null = null
  private realtimeUserId: string | null = null

  // Coalesces concurrent `pullRemote(userId)` calls into one in-flight pass
  // (fix-plan 1.6 point 8, "one store, one channel"). `useTransactions()`
  // mounts independently on every screen that reads transactions, and each
  // mount's effect calls `pullRemote` unconditionally — without this, three
  // simultaneously-mounted screens issue three full network pull passes
  // instead of one. Keyed by userId so a sign-out/sign-in mid-flight (a
  // different key) is never coalesced with the previous account's pull.
  private pullInFlight: Map<string, Promise<{ ok: boolean }>> = new Map()

  // Bumped by stop(). drainQueue()/pullRemote() capture the value on entry
  // and re-check it after every await, so a stop() issued mid-flight (the
  // sign-out teardown) halts them instead of letting the old account's
  // queue entries fire or its rows merge back into a wiped DB.
  private drainEpoch = 0

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager()
    }
    return SyncManager.instance
  }

  start(): void {
    if (this.unsubscribeNetInfo) return // already started

    this.unsubscribeNetInfo = NetInfo.addEventListener(this.handleNetworkChange)
    NetInfo.fetch().then(this.handleNetworkChange)

    const appStateSub = AppState.addEventListener('change', this.handleAppStateChange)
    this.unsubscribeAppState = () => appStateSub.remove()
  }

  stop(): void {
    this.unsubscribeNetInfo?.()
    this.unsubscribeNetInfo = null
    this.unsubscribeAppState?.()
    this.unsubscribeAppState = null
    this.drainEpoch += 1
    this.clearRetryTimer()
    this.stopRealtime()
  }

  addListener(listener: SyncListener): () => void {
    this.listeners.add(listener)
    // Fire once immediately so a screen that mounts after the last drain
    // sees the real current counts instead of nothing until the next
    // network event.
    this.notify(this.isSyncing).catch(() => {})
    return () => this.listeners.delete(listener)
  }

  private async notify(syncing: boolean): Promise<void> {
    const [pendingCount, deadCount] = await Promise.all([getPendingCount(), getDeadCount()])
    this.listeners.forEach((l) => l(syncing, pendingCount, deadCount))
  }

  private handleNetworkChange = (state: NetInfoState): void => {
    const wasOffline = !this.isOnline
    this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false)
    if (this.isOnline && wasOffline) {
      this.drainQueue()
    }
  }

  private handleAppStateChange = (state: AppStateStatus): void => {
    if (state === 'active') {
      this.drainQueue()
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /**
   * Arms a timer for the earliest still-pending entry's backoff window, so
   * a transient failure (a 503 while the device stays continuously online)
   * retries automatically instead of waiting for the next network
   * transition or app-foreground event — fix-plan 1.6 point 3.
   */
  private async scheduleRetry(): Promise<void> {
    this.clearRetryTimer()
    const nextAttemptAt = await getNextScheduledAttempt()
    if (!nextAttemptAt) return
    const delay = Math.max(0, new Date(nextAttemptAt).getTime() - Date.now())
    const epoch = this.drainEpoch
    this.retryTimer = setTimeout(() => {
      if (epoch !== this.drainEpoch) return
      this.drainQueue()
    }, delay)
  }

  /**
   * Drains `sync_queue` in `id ASC` order (autoincrement, monotonic —
   * never `created_at`, a client clock that is not) across every entity
   * type in one pass. A failing entry is classified and isolated
   * (dead-lettered or rescheduled) but never blocks the entries after it:
   * the cursor advances past every entry this pass touches, whatever the
   * outcome, so a single poisoned or currently-backed-off entry cannot
   * make the outer loop re-fetch the same head forever.
   */
  async drainQueue(): Promise<void> {
    if (!this.isOnline || this.isSyncing) return
    this.isSyncing = true
    const epoch = this.drainEpoch
    this.clearRetryTimer()

    try {
      await this.notify(true)
      let cursor = 0
      for (;;) {
        if (epoch !== this.drainEpoch) return
        const dueBy = new Date().toISOString()
        const batch = await getReadyBatch(cursor, DRAIN_BATCH_SIZE, dueBy)
        if (batch.length === 0) break

        for (const entry of batch) {
          if (epoch !== this.drainEpoch) return
          cursor = entry.id
          await this.processEntry(entry, epoch)
        }

        if (batch.length < DRAIN_BATCH_SIZE) break
      }

      // Fix-plan 3.7: "last_synced_at on drain". This pass only reaches
      // here if it ran to completion online (the epoch guards above
      // `return` early on a mid-flight stop()), so it is a real signal
      // that this device just confirmed contact with the server —
      // whether or not there was anything queued to push. `realtimeUserId`
      // is set by `startRealtime(userId)`, called once per session
      // alongside `pullRemote` — best-effort and silent: a missed stamp
      // is caught by the next drain (every reconnect/foreground event).
      if (this.realtimeUserId) {
        touchDeviceSynced(this.realtimeUserId).catch(() => {})
      }
    } finally {
      if (epoch === this.drainEpoch) {
        this.isSyncing = false
        await this.notify(false)
        await this.scheduleRetry()
      }
    }
  }

  private async processEntry(entry: QueueEntry, epoch: number): Promise<void> {
    const handler = ENTITY_HANDLERS[entry.entity_type]
    if (!handler) {
      // Not one of the four entity types this outbox knows how to push —
      // cannot possibly succeed on retry, so dead-letter rather than spin.
      await markDeadLetter(entry.id, `no handler registered for entity_type "${entry.entity_type}"`)
      return
    }

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(entry.payload)
    } catch (err) {
      await markDeadLetter(entry.id, `payload is not valid JSON: ${describeError(err)}`)
      return
    }

    try {
      if (entry.operation === 'create' || entry.operation === 'update') {
        // raw_transcript stays local-only — the Privacy screen promises
        // "voice not stored" and the schema comment on that column says
        // the same. synced_at is server-stamped (migration 018's
        // set_synced_at trigger / DEFAULT now()). Neither goes outbound.
        const { raw_transcript: _rt, synced_at: _sa, ...outbound } = payload
        const { error } = await handler.push(entry.operation, outbound)
        if (error) {
          await this.handlePushError(entry, error)
          return
        }
        if (epoch !== this.drainEpoch) return // stop() mid-flight — do not write into a wiped DB
        await handler.applyRemoteRow({ ...outbound, synced_at: new Date().toISOString() })
      } else {
        const { error } = await handler.pushDelete(payload)
        if (error) {
          await this.handlePushError(entry, error)
          return
        }
      }
      await markSynced(entry.id)
      if (entry.entity_type === 'transaction') {
        DataEvents.emitTransactions(String(payload.user_id ?? ''))
      }
    } catch (err) {
      await this.handlePushError(entry, { message: describeError(err) })
    }
  }

  private async handlePushError(
    entry: QueueEntry,
    error: { code?: string | null; message?: string | null },
  ): Promise<void> {
    const errorClass = classifyError(error)

    if (errorClass === 'recurring_dedup') {
      // Another writer (the server cron, or this device on a prior
      // launch) already created the same recurring occurrence. The local
      // row is the loser of the race — soft-delete it locally so SQLite
      // matches the server's view, then drop the queue entry. Without
      // this branch the retry counter would tick forever on a permanent
      // condition.
      try {
        const payload = JSON.parse(entry.payload)
        await softDeleteTransaction(payload.id)
      } catch {
        // Malformed payload already handled by the JSON.parse guard in
        // processEntry — this branch is unreachable in practice.
      }
      await markSynced(entry.id)
      return
    }

    if (errorClass === 'permanent') {
      await markDeadLetter(entry.id, error.message ?? 'unknown error')
      return
    }

    await markTransientFailure(entry.id, entry.retry_count, error.message ?? 'unknown error')
  }

  /**
   * Awaits the outcome of a specific write (the queue entry most recently
   * enqueued for `entityId`) for up to `timeoutMs`, so `createTransaction`
   * et al. can return a truthful `status` instead of the unconditional
   * `{ error: null }` this outbox used to return regardless of whether
   * the write actually reached the server (fix-plan 1.6 point 1). Kicks
   * a drain immediately rather than waiting for the next network event.
   * `error` carries the real `last_error` on a `'rejected'` outcome, so
   * the caller can show it instead of a generic failure message.
   */
  async awaitOutcome(entityId: string, timeoutMs = 5000): Promise<{ status: OutboxOutcome; error: string | null }> {
    const deadline = Date.now() + timeoutMs
    this.drainQueue()
    for (;;) {
      const entry = await getLatestEntryForEntity(entityId)
      if (!entry) return { status: 'synced', error: null } // no queue entry left for this id - it drained
      if (entry.status === 'dead') return { status: 'rejected', error: entry.last_error }
      if (Date.now() >= deadline) return { status: 'queued', error: null }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  /**
   * Pulls every entity type for `userId`, ascending by `updated_at` with a
   * persisted-in-SQLite cursor, paginating past `PULL_PAGE_SIZE` until a
   * short page — fix-plan 1.6 point 5. The cursor only advances past a
   * page that actually landed, and only once every row on it has been
   * merged locally, so a failed page can never be skipped on the next
   * pull.
   *
   * Concurrent calls for the same `userId` share one in-flight pass rather
   * than each issuing their own — see `pullInFlight`'s docstring.
   */
  async pullRemote(userId: string): Promise<{ ok: boolean }> {
    const existing = this.pullInFlight.get(userId)
    if (existing) return existing

    const promise = this.pullRemoteOnce(userId).finally(() => {
      this.pullInFlight.delete(userId)
    })
    this.pullInFlight.set(userId, promise)
    return promise
  }

  private async pullRemoteOnce(userId: string): Promise<{ ok: boolean }> {
    if (!this.isOnline) return { ok: false }
    const epoch = this.drainEpoch
    let allOk = true

    for (const entityType of ENTITY_TYPES) {
      if (epoch !== this.drainEpoch) return { ok: false }
      const handler = ENTITY_HANDLERS[entityType]
      const startCursor = await getSyncCursor(entityType)

      const result = await paginateAscending<Record<string, unknown>>(
        (cursor, limit) => fetchPage(handler.table, userId, cursor, limit),
        (row) => row.updated_at as string,
        startCursor,
        PULL_PAGE_SIZE,
        async (rows) => {
          if (epoch !== this.drainEpoch) return
          for (const row of rows) {
            await handler.applyRemoteRow(row)
          }
        },
      )

      if (!result.ok) {
        allOk = false
        continue
      }
      if (epoch !== this.drainEpoch) return { ok: false }
      if (result.cursor) {
        await setSyncCursor(entityType, result.cursor)
      }
    }

    return { ok: allOk }
  }

  /**
   * One realtime channel per signed-in user, covering all four entities,
   * shared by every mounted hook instance — replaces one channel per
   * `useTransactions()` mount with a random name suffix (fix-plan 1.6
   * point 8). A stable name means React Strict Mode's double-invoke
   * would collide on a genuine duplicate subscribe instead of masking it,
   * which is exactly the point: `startRealtime` is idempotent per user
   * and callers are expected to call it, not `supabase.channel()`
   * directly.
   */
  startRealtime(userId: string): void {
    if (this.realtimeChannel && this.realtimeUserId === userId) return
    this.stopRealtime()
    this.realtimeUserId = userId

    let channel = supabase.channel(`sync:${userId}`)
    for (const entityType of ENTITY_TYPES) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: REALTIME_TABLES[entityType],
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row: unknown = payload.new
          if (!row || typeof row !== 'object' || !('id' in row)) return
          const handler = ENTITY_HANDLERS[entityType]
          handler
            .applyRemoteRow(row as Record<string, unknown>)
            .then(() => {
              if (entityType === 'transaction') DataEvents.emitTransactions(userId)
            })
            .catch(() => {})
        },
      )
    }
    this.realtimeChannel = channel.subscribe()
  }

  private stopRealtime(): void {
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe()
      supabase.removeChannel(this.realtimeChannel)
      this.realtimeChannel = null
    }
    this.realtimeUserId = null
  }

  get online(): boolean {
    return this.isOnline
  }

  /**
   * Test seam: sets `isOnline` directly, bypassing NetInfo entirely — the
   * regression tests exercise the real drain/pull logic against a real
   * (node:sqlite) database with only the network boundary (`supabase`)
   * mocked, and driving `isOnline` through the real NetInfo listener would
   * make every test's timing depend on a mocked native module's callback
   * ordering instead of the outbox logic under test.
   */
  __setOnlineForTests(online: boolean): void {
    this.isOnline = online
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function fetchPage(
  table: string,
  userId: string,
  cursor: string | undefined,
  limit: number,
): Promise<PageResult<Record<string, unknown>>> {
  let query = supabaseAny
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (cursor) query = query.gt('updated_at', cursor)
  const { data, error } = (await query) as {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }
  return { rows: data ?? [], error }
}

export const syncManager = SyncManager.getInstance()
