import { strict as assert } from 'node:assert'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { __setDbForTests, initDatabase } from '../localDb'
import {
  enqueue,
  getReadyBatch,
  markSynced,
  markTransientFailure,
  markDeadLetter,
  getDeadLetterEntries,
  clearDeadLetterEntry,
  retryDeadLetterEntry,
  resetDeadLetterEntries,
  getPendingCount,
  getDeadCount,
  getNextScheduledAttempt,
  getLatestEntryForEntity,
} from '../syncQueue'
import { DatabaseSync, openShim, asSqliteDatabase, makeTempDir, type Shim } from './testDb'

describe.skipIf(!DatabaseSync)('syncQueue', () => {
  let tmp: { dir: string; cleanup: () => void }
  let db: Shim
  let counter = 0

  beforeEach(async () => {
    if (!tmp) tmp = makeTempDir('sync-queue-test-')
    db = openShim(`${tmp.dir}/queue-${counter++}.db`)
    await initDatabase(db)
    __setDbForTests(asSqliteDatabase(db))
  })

  afterAll(() => {
    __setDbForTests(null)
    tmp?.cleanup()
  })

  it('getReadyBatch orders by id, not created_at — a client clock is not monotonic', async () => {
    // Insert with created_at timestamps intentionally out of insertion
    // order (a clock adjustment mid-session). id (AUTOINCREMENT) is the
    // only value SQLite guarantees is monotonic with insertion order.
    await enqueue('create', 'a', { n: 1 }, 'transaction')
    await enqueue('create', 'b', { n: 2 }, 'transaction')
    await enqueue('create', 'c', { n: 3 }, 'transaction')
    // Force entry 'b' (the middle insert) to carry an EARLIER created_at
    // than 'a' — this is exactly what a backward clock jump produces.
    await db.runAsync("UPDATE sync_queue SET created_at = '2000-01-01T00:00:00.000Z' WHERE entity_id = 'b'")

    const batch = await getReadyBatch(0, 10, new Date().toISOString())
    assert.deepEqual(
      batch.map((e) => e.entity_id),
      ['a', 'b', 'c'],
      'must reflect insertion (id) order, not the corrupted created_at order',
    )
  })

  it('getReadyBatch never re-fetches an id at or below the cursor', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    await enqueue('create', 'b', {}, 'transaction')
    const first = await getReadyBatch(0, 10, new Date().toISOString())
    const afterFirst = await getReadyBatch(first[first.length - 1].id, 10, new Date().toISOString())
    assert.equal(afterFirst.length, 0)
  })

  it('a transient failure schedules next_attempt_at and excludes the entry from the ready batch until due', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markTransientFailure(entry.id, entry.retry_count, 'Network request failed')

    const notYetDue = await getReadyBatch(0, 10, new Date().toISOString())
    expect(notYetDue).toHaveLength(0)

    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    const nowDue = await getReadyBatch(0, 10, future)
    expect(nowDue).toHaveLength(1)
    expect(nowDue[0].retry_count).toBe(1)
    expect(nowDue[0].last_error).toBe('Network request failed')
  })

  it('a permanent error dead-letters immediately and drops out of the ready batch entirely', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markDeadLetter(entry.id, 'violates check constraint "transactions_amount_check"')

    const ready = await getReadyBatch(0, 10, new Date(Date.now() + 999999999).toISOString())
    expect(ready).toHaveLength(0)

    const dead = await getDeadLetterEntries()
    expect(dead).toHaveLength(1)
    expect(dead[0].last_error).toContain('transactions_amount_check')
    expect(await getPendingCount()).toBe(0)
    expect(await getDeadCount()).toBe(1)
  })

  it('a second drain does not resurrect a dead-lettered entry (no automatic reset)', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markDeadLetter(entry.id, 'permanent')

    // Simulate "a second start()" — nothing in this module resets dead
    // entries on its own; only an explicit call does.
    const readyAfter = await getReadyBatch(0, 10, new Date(Date.now() + 999999999).toISOString())
    expect(readyAfter).toHaveLength(0)
    expect(await getDeadCount()).toBe(1)
  })

  it('retryDeadLetterEntry moves a specific entry back to pending', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markDeadLetter(entry.id, 'permanent')

    await retryDeadLetterEntry(entry.id)

    expect(await getDeadCount()).toBe(0)
    const ready = await getReadyBatch(0, 10, new Date().toISOString())
    expect(ready).toHaveLength(1)
    expect(ready[0].retry_count).toBe(0)
  })

  it('clearDeadLetterEntry discards a specific entry permanently', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markDeadLetter(entry.id, 'permanent')

    await clearDeadLetterEntry(entry.id)

    expect(await getDeadLetterEntries()).toHaveLength(0)
    expect(await getLatestEntryForEntity('a')).toBeNull()
  })

  it('resetDeadLetterEntries is available but must be called explicitly — nothing in this module invokes it', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markDeadLetter(entry.id, 'permanent')
    expect(await getDeadCount()).toBe(1)

    await resetDeadLetterEntries()
    expect(await getDeadCount()).toBe(0)
    expect(await getPendingCount()).toBe(1)
  })

  it('markSynced removes the entry entirely', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    const [entry] = await getReadyBatch(0, 10, new Date().toISOString())
    await markSynced(entry.id)
    expect(await getLatestEntryForEntity('a')).toBeNull()
    expect(await getPendingCount()).toBe(0)
  })

  it('getNextScheduledAttempt reports the earliest future next_attempt_at across entries', async () => {
    await enqueue('create', 'a', {}, 'transaction')
    await enqueue('create', 'b', {}, 'transaction')
    const [a, b] = await getReadyBatch(0, 10, new Date().toISOString())

    await markTransientFailure(a.id, 0, 'err') // ~30s out
    await markTransientFailure(b.id, 5, 'err') // ~16min out (capped at 15min)

    const next = await getNextScheduledAttempt()
    expect(next).not.toBeNull()
    const aEntry = await getLatestEntryForEntity('a')
    expect(next).toBe(aEntry!.next_attempt_at)
  })

  it('enqueue is entity-type generic', async () => {
    await enqueue('create', 'cat-1', { name: 'Food' }, 'category')
    await enqueue('create', 'budget-1', { amount: 100 }, 'budget')
    await enqueue('create', 'rule-1', { amount: 9.99 }, 'recurring_rule')

    const ready = await getReadyBatch(0, 10, new Date().toISOString())
    assert.deepEqual(
      ready.map((e) => e.entity_type),
      ['category', 'budget', 'recurring_rule'],
    )
  })
})
