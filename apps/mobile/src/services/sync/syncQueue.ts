import { getDb } from './localDb'

export type QueueOperation = 'create' | 'update' | 'delete'

export interface QueueEntry {
  id: number
  operation: QueueOperation
  entity_type: string
  entity_id: string
  payload: string
  client_timestamp: string
  retry_count: number
  last_error: string | null
  created_at: string
}

export async function enqueue(
  operation: QueueOperation,
  entityId: string,
  payload: object,
): Promise<void> {
  const db = await getDb()
  const now = new Date().toISOString()
  await db.runAsync(
    `INSERT INTO sync_queue (operation, entity_type, entity_id, payload, client_timestamp, retry_count, created_at)
     VALUES (?, 'transaction', ?, ?, ?, 0, ?)`,
    [operation, entityId, JSON.stringify(payload), now, now],
  )
}

export async function getPendingEntries(limit = 20): Promise<QueueEntry[]> {
  const db = await getDb()
  const rows = await db.getAllAsync(
    'SELECT * FROM sync_queue WHERE retry_count < 5 ORDER BY created_at ASC LIMIT ?',
    [limit],
  )
  return rows as QueueEntry[]
}

export async function removeEntry(id: number): Promise<void> {
  const db = await getDb()
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id])
}

export async function incrementRetry(id: number, error: string): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
    [error, id],
  )
}

export async function getDeadLetterEntries(): Promise<QueueEntry[]> {
  const db = await getDb()
  const rows = await db.getAllAsync(
    'SELECT * FROM sync_queue WHERE retry_count >= 5 ORDER BY created_at ASC',
  )
  return rows as QueueEntry[]
}

export async function clearDeadLetterEntry(id: number): Promise<void> {
  const db = await getDb()
  await db.runAsync('DELETE FROM sync_queue WHERE id = ? AND retry_count >= 5', [id])
}

/** Reset all dead-letter entries so they are retried on next drain. */
export async function resetDeadLetterEntries(): Promise<void> {
  const db = await getDb()
  await db.runAsync(
    "UPDATE sync_queue SET retry_count = 0, last_error = NULL WHERE retry_count >= 5",
  )
}
