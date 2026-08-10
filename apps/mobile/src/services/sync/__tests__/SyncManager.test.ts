/**
 * Regression tests for the outbox rebuild (fix-plan 1.6). Runs the real
 * drain/pull logic — SyncManager, syncQueue, the entity registry — against
 * a real (node:sqlite) local database, with only the network boundary
 * (`supabase`) mocked. `@react-native-community/netinfo` and `react-native`
 * are mocked purely so the module graph loads under Node; `isOnline` is
 * driven directly via the `__setOnlineForTests` test seam instead of
 * through the mocked NetInfo callback, so test timing depends on the
 * outbox logic under test, not on a fake native module's callback order.
 */
import { strict as assert } from 'node:assert'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync, asSqliteDatabase, makeTempDir, openShim, type Shim } from './testDb'
import { initDatabase, __setDbForTests } from '../localDb'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}))

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => () => {}),
    fetch: vi.fn(() => Promise.resolve({ isConnected: false, isInternetReachable: false })),
  },
}))

vi.mock('react-native', () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  DeviceEventEmitter: { emit: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) },
  Platform: { OS: 'ios' },
}))

// `entityRegistry.ts` routes the `transaction` entity through
// `transactionStore.ts`, which now resolves `local_day` (fix-plan 1.3
// part 3) via `expo-localization`'s `getCalendars` — real
// `expo-modules-core` touches RN-only globals (`__DEV__`) at import time
// outside a React Native runtime, so this must be mocked before `../SyncManager`
// pulls that chain in below. Mirrors `useTransactions.test.ts`'s
// `deleteTransactionAndEnqueue` test.
vi.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'UTC' }] }))

// `SyncManager.ts` now calls `deviceRegistry.ts`'s `touchDeviceSynced` at
// the end of a drain pass (fix-plan 3.7) — same real-`expo-modules-core`
// reason as `expo-localization` above, for `expo-secure-store`/
// `expo-crypto`/`expo-constants`.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve('mock-device-id')),
  setItemAsync: vi.fn(() => Promise.resolve()),
}))
vi.mock('expo-crypto', () => ({ randomUUID: () => 'mock-device-id' }))
vi.mock('expo-constants', () => ({ default: { deviceName: 'Test Device' } }))

// Imported after the mocks above are registered (vi.mock calls are
// hoisted above imports by vitest, but these dynamic-safe static imports
// still only resolve the (now-mocked) module graph at collection time).
const { syncManager } = await import('../SyncManager')
const { enqueue, getDeadLetterEntries, getPendingCount, getDeadCount, getReadyBatch } = await import(
  '../syncQueue'
)

/** A chainable object that resolves to `result` no matter how many
 *  `.eq()/.order()/.limit()/.gt()/.lt()/.update()` calls precede the
 *  await — mirrors supabase-js's thenable query builder closely enough
 *  for these tests without depending on its real implementation. */
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = self
  builder.eq = self
  builder.order = self
  builder.limit = self
  builder.gt = self
  builder.lt = self
  builder.update = self
  builder.upsert = () => Promise.resolve(result)
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

function pgError(code: string, message: string) {
  return { code, message }
}

describe.skipIf(!DatabaseSync)('SyncManager drain loop', () => {
  let tmp: { dir: string; cleanup: () => void }
  let db: Shim
  let counter = 0

  beforeEach(async () => {
    if (!tmp) tmp = makeTempDir('sync-manager-test-')
    db = openShim(`${tmp.dir}/mgr-${counter++}.db`)
    await initDatabase(db)
    __setDbForTests(asSqliteDatabase(db))
    syncManager.__setOnlineForTests(true)
    mocks.rpc.mockReset()
    mocks.from.mockReset()
  })

  afterEach(() => {
    syncManager.__setOnlineForTests(false)
  })

  afterAll(() => {
    __setDbForTests(null)
    tmp?.cleanup()
  })

  function fullPayload(overrides: Record<string, unknown> = {}) {
    const now = '2026-08-09T12:00:00.000Z'
    return {
      id: overrides.client_id ?? 'txn-1',
      user_id: 'user-1',
      amount: 10,
      direction: 'debit',
      currency_code: 'USD',
      category_id: null,
      merchant: 'Cafe',
      merchant_domain: null,
      note: null,
      payment_method: 'cash',
      amount_in_profile_currency: 10,
      fx_rate_to_profile: 1,
      fx_rate_date: '2026-08-09',
      transacted_at: now,
      source: 'manual',
      raw_transcript: null,
      ai_confidence: null,
      is_recurring: false,
      recurring_rule_id: null,
      recurring_frequency: null,
      client_id: 'txn-1',
      client_created_at: now,
      version: 1,
      is_deleted: false,
      deleted_at: null,
      synced_at: null,
      created_at: now,
      updated_at: now,
      ...overrides,
    }
  }

  it('done-when: a poisoned middle entry dead-letters; entries 1 and 3 still reach the server; pending count is accurate; a second start does not resurrect it', async () => {
    await enqueue('create', 'a', fullPayload({ client_id: 'a', id: 'a' }), 'transaction')
    await enqueue('create', 'b', fullPayload({ client_id: 'b', id: 'b' }), 'transaction')
    await enqueue('create', 'c', fullPayload({ client_id: 'c', id: 'c' }), 'transaction')

    mocks.rpc.mockImplementation((_fn: string, args: { payload: { client_id: string } }) => {
      if (args.payload.client_id === 'b') {
        // 23514 — a CHECK violation (e.g. amount <= 0). Permanent.
        return Promise.resolve({ data: null, error: pgError('23514', 'violates check constraint "transactions_amount_check"') })
      }
      return Promise.resolve({ data: { ...args.payload }, error: null })
    })

    await syncManager.drainQueue()

    expect(await getPendingCount()).toBe(0)
    expect(await getDeadCount()).toBe(1)

    const dead = await getDeadLetterEntries()
    expect(dead).toHaveLength(1)
    const deadPayload = JSON.parse(dead[0].payload)
    assert.equal(deadPayload.client_id, 'b')
    expect(dead[0].last_error).toContain('transactions_amount_check')

    // a and c actually reached the mocked server.
    const calledIds = mocks.rpc.mock.calls.map(
      (call) => (call[1] as { payload: { client_id: string } }).payload.client_id,
    )
    assert.deepEqual(calledIds, ['a', 'b', 'c'])

    // "a second start() does not resurrect it" — nothing but an explicit
    // retryDeadLetterEntry/resetDeadLetterEntries call changes a dead
    // entry's status; draining again leaves it alone.
    mocks.rpc.mockClear()
    await syncManager.drainQueue()
    expect(await getDeadCount()).toBe(1)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('continues past a transient failure instead of aborting the whole drain', async () => {
    await enqueue('create', 'a', fullPayload({ client_id: 'a', id: 'a' }), 'transaction')
    await enqueue('create', 'b', fullPayload({ client_id: 'b', id: 'b' }), 'transaction')

    mocks.rpc.mockImplementation((_fn: string, args: { payload: { client_id: string } }) => {
      if (args.payload.client_id === 'a') {
        return Promise.resolve({ data: null, error: { message: 'Network request failed' } })
      }
      return Promise.resolve({ data: { ...args.payload }, error: null })
    })

    await syncManager.drainQueue()

    // b synced even though a (earlier in the queue) failed transiently.
    expect(await getPendingCount()).toBe(1) // a, rescheduled
    expect(await getDeadCount()).toBe(0)
    const remaining = await getReadyBatch(0, 10, new Date(Date.now() + 999999999).toISOString())
    assert.equal(remaining.length, 1)
    const remainingPayload = JSON.parse(remaining[0].payload)
    assert.equal(remainingPayload.client_id, 'a')
    assert.equal(remaining[0].retry_count, 1)
  })

  it('a recurring-dedup 23505 soft-deletes the local row and drops the queue entry without dead-lettering', async () => {
    const { upsertTransaction, getTransactionById } = await import('../transactionStore')
    const payload = fullPayload({ client_id: 'dup-1', id: 'dup-1' })
    await upsertTransaction(payload as never)

    await enqueue('create', 'dup-1', payload, 'transaction')
    mocks.rpc.mockResolvedValue({
      data: null,
      error: pgError('23505', 'duplicate key value violates unique constraint "idx_txn_recurring_dedup"'),
    })

    await syncManager.drainQueue()

    expect(await getPendingCount()).toBe(0)
    expect(await getDeadCount()).toBe(0)
    const row = await getTransactionById('dup-1')
    expect(row?.is_deleted).toBe(true)
  })

  it('a real unique violation on a different constraint dead-letters instead of soft-deleting', async () => {
    const { upsertTransaction, getTransactionById } = await import('../transactionStore')
    const payload = fullPayload({ client_id: 'dup-2', id: 'dup-2' })
    await upsertTransaction(payload as never)

    await enqueue('create', 'dup-2', payload, 'transaction')
    mocks.rpc.mockResolvedValue({
      data: null,
      error: pgError('23505', 'duplicate key value violates unique constraint "transactions_user_client_unique"'),
    })

    await syncManager.drainQueue()

    expect(await getDeadCount()).toBe(1)
    const row = await getTransactionById('dup-2')
    expect(row?.is_deleted).toBe(false)
  })

  it('drains strictly in id order across a batch boundary larger than the page size', async () => {
    for (let i = 0; i < 25; i++) {
      await enqueue('create', `t${i}`, fullPayload({ client_id: `t${i}`, id: `t${i}` }), 'transaction')
    }
    mocks.rpc.mockImplementation((_fn: string, args: { payload: { client_id: string } }) =>
      Promise.resolve({ data: { ...args.payload }, error: null }),
    )

    await syncManager.drainQueue()

    const order = mocks.rpc.mock.calls.map(
      (call) => (call[1] as { payload: { client_id: string } }).payload.client_id,
    )
    assert.deepEqual(order, Array.from({ length: 25 }, (_, i) => `t${i}`))
    expect(await getPendingCount()).toBe(0)
  })

  it('awaitOutcome reports "rejected" with the real last_error for a permanent failure', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: pgError('23514', 'violates check constraint "transactions_amount_check"'),
    })
    await enqueue('create', 'reject-1', fullPayload({ client_id: 'reject-1', id: 'reject-1' }), 'transaction')

    const outcome = await syncManager.awaitOutcome('reject-1', 2000)

    expect(outcome.status).toBe('rejected')
    expect(outcome.error).toContain('transactions_amount_check')
  })

  it('awaitOutcome reports "synced" once the entry drains successfully', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: 'sync-1' }, error: null })
    await enqueue('create', 'sync-1', fullPayload({ client_id: 'sync-1', id: 'sync-1' }), 'transaction')

    const outcome = await syncManager.awaitOutcome('sync-1', 2000)

    expect(outcome.status).toBe('synced')
    expect(outcome.error).toBeNull()
  })

  it('a transient failure schedules a real retry timer that re-drains within the backoff window', async () => {
    vi.useFakeTimers()
    try {
      await enqueue('create', 'retry-1', fullPayload({ client_id: 'retry-1', id: 'retry-1' }), 'transaction')

      let attempt = 0
      mocks.rpc.mockImplementation(() => {
        attempt++
        if (attempt === 1) return Promise.resolve({ data: null, error: { message: 'Network request failed' } })
        return Promise.resolve({ data: { id: 'retry-1' }, error: null })
      })

      await syncManager.drainQueue()
      expect(attempt).toBe(1)
      expect(await getPendingCount()).toBe(1)

      // Max possible backoff for retry_count 0 is 36s (30s + 20% jitter);
      // 40s guarantees the scheduled timer has fired.
      await vi.advanceTimersByTimeAsync(40_000)

      expect(attempt).toBe(2)
      expect(await getPendingCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe.skipIf(!DatabaseSync)('SyncManager.pullRemote', () => {
  let tmp: { dir: string; cleanup: () => void }
  let db: Shim
  let counter = 0

  beforeEach(async () => {
    if (!tmp) tmp = makeTempDir('sync-manager-pull-test-')
    db = openShim(`${tmp.dir}/pull-${counter++}.db`)
    await initDatabase(db)
    __setDbForTests(asSqliteDatabase(db))
    syncManager.__setOnlineForTests(true)
    mocks.from.mockReset()
  })

  afterEach(() => {
    syncManager.__setOnlineForTests(false)
  })

  afterAll(() => {
    __setDbForTests(null)
    tmp?.cleanup()
  })

  function serverRow(i: number) {
    const iso = `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`
    return {
      id: `srv-${i}`,
      user_id: 'user-1',
      amount: 5,
      direction: 'debit',
      currency_code: 'USD',
      category_id: null,
      merchant: null,
      merchant_domain: null,
      note: null,
      payment_method: null,
      amount_in_profile_currency: 5,
      fx_rate_to_profile: 1,
      fx_rate_date: '2026-01-01',
      transacted_at: iso,
      source: 'manual',
      raw_transcript: null,
      ai_confidence: null,
      is_recurring: false,
      recurring_rule_id: null,
      recurring_frequency: null,
      client_id: `srv-${i}`,
      client_created_at: iso,
      version: 1,
      is_deleted: false,
      deleted_at: null,
      synced_at: iso,
      created_at: iso,
      updated_at: iso,
    }
  }

  it('paginates past 200 rows, persists the cursor, and transfers zero rows on a second pull', async () => {
    const { getTransactions } = await import('../transactionStore')
    const all = Array.from({ length: 450 }, (_, i) => serverRow(i))

    // Every entity's table is queried by pullRemote (transaction, category,
    // budget, recurring_rule) — only 'transactions' has rows in this test;
    // the other three legitimately answer empty every time.
    // `.then()` is resolved lazily (at await-time), reading whatever
    // `.gt()`/`.limit()` captured by then — SyncManager's real fetchPage
    // calls `.limit()` before the conditional `.gt()`, and a fully
    // chainable builder must not care which order filter methods land in.
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'transactions') return chain({ data: [], error: null })
      let gtCursor: string | undefined
      let limitN = 0
      const builder: Record<string, unknown> = {}
      const self = () => builder
      builder.select = self
      builder.eq = self
      builder.order = self
      builder.gt = (_col: string, value: string) => {
        gtCursor = value
        return builder
      }
      builder.limit = (n: number) => {
        limitN = n
        return builder
      }
      builder.then = (resolve: (v: unknown) => unknown) => {
        const startIdx = gtCursor ? all.findIndex((r) => r.updated_at === gtCursor) + 1 : 0
        const rows = all.slice(startIdx, startIdx + limitN)
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      }
      return builder
    })

    const result = await syncManager.pullRemote('user-1')
    expect(result.ok).toBe(true)

    const local = await getTransactions('user-1')
    expect(local).toHaveLength(450)

    // Second pull starts from the persisted cursor — zero rows transferred.
    mocks.from.mockClear()
    let transactionsPageCalls = 0
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'transactions') return chain({ data: [], error: null })
      transactionsPageCalls++
      return chain({ data: [], error: null })
    })

    const second = await syncManager.pullRemote('user-1')
    expect(second.ok).toBe(true)
    expect(transactionsPageCalls).toBe(1) // one short (empty) page, not a re-walk of the 450
    expect(await getTransactions('user-1')).toHaveLength(450)
  })

  it('regression: three concurrently-mounted transaction-consuming screens issue exactly one pullRemote pass and one realtime channel subscription', async () => {
    // Mirrors three `useTransactions('user-1')` instances mounting in the
    // same render pass — each calls `startRealtime` then `pullRemote` from
    // its own effect (fix-plan 1.6 point 8's "one store, one channel").
    let transactionsPageCalls = 0
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'transactions') return chain({ data: [], error: null })
      transactionsPageCalls++
      return chain({ data: [], error: null })
    })

    const channelBuilder: Record<string, unknown> = { unsubscribe: vi.fn() }
    const self = () => channelBuilder
    channelBuilder.on = self
    channelBuilder.subscribe = self
    mocks.channel.mockReset()
    mocks.channel.mockImplementation(() => channelBuilder)

    syncManager.startRealtime('user-1')
    syncManager.startRealtime('user-1')
    syncManager.startRealtime('user-1')
    const results = await Promise.all([
      syncManager.pullRemote('user-1'),
      syncManager.pullRemote('user-1'),
      syncManager.pullRemote('user-1'),
    ])

    expect(results.every((r) => r.ok)).toBe(true)
    // One channel: startRealtime's `realtimeChannel && realtimeUserId ===
    // userId` guard makes the 2nd/3rd call a no-op.
    expect(mocks.channel).toHaveBeenCalledTimes(1)
    // One pull pass: the 2nd/3rd `pullRemote` call for the same userId
    // shares the first call's in-flight promise (`pullInFlight`) instead of
    // each walking the full entity list itself — three uncoalesced passes
    // would report 3 here, not 1.
    expect(transactionsPageCalls).toBe(1)

    syncManager.stop()
  })
})
