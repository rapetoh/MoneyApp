import { getDb } from './localDb'
import { computeBackoffMs } from './retryPolicy'
import type { SyncEntityType } from '@voice-expense/shared'

export type QueueOperation = 'create' | 'update' | 'delete'
export type QueueStatus = 'pending' | 'dead'

export interface QueueEntry {
  id: number
  operation: QueueOperation
  entity_type: SyncEntityType
  entity_id: string
  payload: string
  client_timestamp: string
  retry_count: number
  last_error: string | null
  status: QueueStatus
  next_attempt_at: string | null
  created_at: string
}

/**
 * `entityType` is a trailing optional parameter, not the natural second
 * position, so every call site outside this item's file ownership that
 * still calls `enqueue(operation, entityId, payload)` — `recurringCatchUp.ts`,
 * `transaction/[id].tsx` — keeps compiling and keeps behaving correctly
 * unchanged (they only ever enqueue transactions, so the default is exactly
 * right for them) rather than being broken by this item's entity-generic
 * rebuild. New call sites should pass it explicitly.
 */
export async function enqueue(
  operation: QueueOperation,
  entityId: string,
  payload: object,
  entityType: SyncEntityType = 'transaction',
): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.runAsync(
    `INSERT INTO sync_queue (operation, entity_type, entity_id, payload, client_timestamp, retry_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
    [operation, entityType, entityId, JSON.stringify(payload), now, now],
  )
}

/**
 * The next batch of entries ready to attempt, ordered by `id` (the
 * autoincrement PK — monotonic) rather than `created_at` (the client's
 * wall clock, which is not: a clock adjustment or two writes landing in
 * the same millisecond can put entries out of insertion order). Restricted
 * to `id > afterId` so a caller draining multiple batches in one pass
 * never re-fetches an entry it already handled in this pass — a bare
 * `LIMIT` would keep re-fetching the same head entries forever once one
 * of them is due to retry later rather than removed (fix-plan 1.6 point
 * 2). `dueBy` (an ISO instant) excludes entries still inside their
 * backoff window.
 */
export async function getReadyBatch(afterId: number, limit: number, dueBy: string): Promise<QueueEntry[]> {
  const db = await getDb()
  const rows = await db.getAllAsync(
    `SELECT * FROM sync_queue
     WHERE status = 'pending' AND id > ?
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY id ASC
     LIMIT ?`,
    [afterId, dueBy, limit],
  )
  return rows as QueueEntry[]
}

/** Removes an entry that synced successfully. */
export async function markSynced(id: number): Promise<void> {
  const db = await getDb()
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id])
}

/**
 * Records a transient failure (network/5xx/401) and schedules the next
 * attempt with exponential backoff + jitter — the entry stays 'pending'
 * so it is retried, not lost.
 */
export async function markTransientFailure(id: number, retryCount: number, error: string): Promise<void> {
  const db = await getDb()
  const nextAttemptAt = new Date(Date.now() + computeBackoffMs(retryCount)).toISOString()
  await db.runAsync(
    'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ?, next_attempt_at = ? WHERE id = ?',
    [error, nextAttemptAt, id],
  )
}

/**
 * Dead-letters an entry immediately on a permanent error (Postgres 23xxx/
 * 42xxx other than the recurring-dedup carve-out) — it moves out of
 * 'pending' so it stops being re-fetched and stops blocking entries
 * behind it, without waiting for a retry-count threshold that would keep
 * resurfacing it on every drain in between.
 */
export async function markDeadLetter(id: number, error: string): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    "UPDATE sync_queue SET status = 'dead', last_error = ? WHERE id = ?",
    [error, id],
  )
}

export async function getDeadLetterEntries(): Promise<QueueEntry[]> {
  const db = await getDb()
  const rows = await db.getAllAsync("SELECT * FROM sync_queue WHERE status = 'dead' ORDER BY id ASC")
  return rows as QueueEntry[]
}

export async function clearDeadLetterEntry(id: number): Promise<void> {
  const db = await getDb()
  await db.runAsync("DELETE FROM sync_queue WHERE id = ? AND status = 'dead'", [id])
}

/** Moves one dead-lettered entry back to 'pending' so the next drain retries it. */
export async function retryDeadLetterEntry(id: number): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    "UPDATE sync_queue SET status = 'pending', retry_count = 0, next_attempt_at = NULL WHERE id = ? AND status = 'dead'",
    [id],
  )
}

/**
 * Resets every dead-lettered entry back to 'pending'. Not called
 * automatically anywhere (the old unconditional call from
 * `SyncManager.start()` re-armed every poisoned entry on every launch —
 * fix-plan 1.6 point 3 / audit 06-F9) — exported for an explicit one-time
 * repair path, which should gate itself behind a schema-version marker if
 * one is ever needed.
 */
export async function resetDeadLetterEntries(): Promise<void> {
  const db = await getDb()
  await db.runAsync("UPDATE sync_queue SET status = 'pending', retry_count = 0, next_attempt_at = NULL WHERE status = 'dead'")
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'",
  )
  return row?.n ?? 0
}

export async function getDeadCount(): Promise<number> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'dead'")
  return row?.n ?? 0
}

/**
 * Earliest `next_attempt_at` among still-pending entries — the instant the
 * retry scheduler should wake up next. Ignores entries that are already
 * due (NULL or in the past); those belong in the *current* drain pass, not
 * a future timer.
 */
export async function getNextScheduledAttempt(): Promise<string | null> {
  const db = await getDb()
  const row = await db.getFirstAsync<{ next_attempt_at: string | null }>(
    `SELECT MIN(next_attempt_at) AS next_attempt_at FROM sync_queue
     WHERE status = 'pending' AND next_attempt_at IS NOT NULL AND next_attempt_at > ?`,
    [new Date().toISOString()],
  )
  return row?.next_attempt_at ?? null
}

/** Fetches a single entry by id — used to report a create/edit's outbox fate back to the caller. */
export async function getEntryById(id: number): Promise<QueueEntry | null> {
  const db = await getDb()
  const row = await db.getFirstAsync('SELECT * FROM sync_queue WHERE id = ?', [id])
  return (row as QueueEntry | null) ?? null
}

/** Finds the (at most one) live queue entry for a given entity, newest first — used to await a fresh write's outcome. */
export async function getLatestEntryForEntity(entityId: string): Promise<QueueEntry | null> {
  const db = await getDb()
  const row = await db.getFirstAsync(
    'SELECT * FROM sync_queue WHERE entity_id = ? ORDER BY id DESC LIMIT 1',
    [entityId],
  )
  return (row as QueueEntry | null) ?? null
}
