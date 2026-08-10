/**
 * Regression test for audit 07-F32 ("`deleteTransaction` drops the sync
 * enqueue when the row is not in React state"), fix-plan 1.6. Exercises
 * `deleteTransactionAndEnqueue` — the plain (non-hook) function
 * `useTransactions()`'s `deleteTransaction` delegates to — directly against
 * a real (node:sqlite) local database with only the network boundary
 * (`supabase`) mocked, exactly as `SyncManager.test.ts` does. Deliberately
 * never constructs any "component state" containing the row: that's the
 * point. The old implementation read the row to delete from a hook
 * instance's `transactions` array and silently skipped the enqueue when it
 * wasn't there; this function only ever reads SQLite, so there is no
 * component-state collection for a row to be "missing from" any more.
 */
import { strict as assert } from 'node:assert'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync, asSqliteDatabase, makeTempDir, openShim, type Shim } from '../../services/sync/__tests__/testDb'
import { initDatabase, __setDbForTests } from '../../services/sync/localDb'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
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

// useTransactions.ts imports `expo-crypto` for `createTransaction`
// (unused by the function under test here) — real `expo-crypto` calls
// `requireNativeModule` at import time, which throws outside a React
// Native runtime, so the whole module must be mocked before import.
vi.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid' }))

// `useTransactions.ts` imports `SyncManager.ts`, which now calls
// `deviceRegistry.ts`'s `touchDeviceSynced` at the end of a drain pass
// (fix-plan 3.7) — same real-`expo-modules-core` reason as `expo-crypto`
// above, for `expo-secure-store`/`expo-constants`.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve('mock-device-id')),
  setItemAsync: vi.fn(() => Promise.resolve()),
}))
vi.mock('expo-constants', () => ({ default: { deviceName: 'Test Device' } }))

// Same reason, for `expo-localization` — `createTransaction`'s
// `getDeviceTimeZone` (fix-plan 1.3 part 3, `local_day`) pulls in
// `expo-modules-core`, which touches RN-only globals (`__DEV__`) at
// import time outside a React Native runtime.
vi.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'UTC' }] }))

const { syncManager } = await import('../../services/sync/SyncManager')
const { deleteTransactionAndEnqueue } = await import('../useTransactions')
const { upsertTransaction, getTransactionById } = await import('../../services/sync/transactionStore')
const { getPendingCount } = await import('../../services/sync/syncQueue')

function pgError(code: string, message: string) {
  return { code, message }
}

/** A chainable object that resolves to `result` no matter how many
 *  `.update()/.eq()/.lt()` calls precede the await — mirrors
 *  supabase-js's thenable query builder closely enough for
 *  `versionGuardedDelete`'s `.from(table).update(...).eq(...).eq(...).lt(...)`
 *  chain without depending on its real implementation. */
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.update = self
  builder.eq = self
  builder.lt = self
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

describe.skipIf(!DatabaseSync)('deleteTransactionAndEnqueue', () => {
  let tmp: { dir: string; cleanup: () => void }
  let db: Shim
  let counter = 0

  beforeEach(async () => {
    if (!tmp) tmp = makeTempDir('use-transactions-test-')
    db = openShim(`${tmp.dir}/txn-${counter++}.db`)
    await initDatabase(db)
    __setDbForTests(asSqliteDatabase(db))
    syncManager.__setOnlineForTests(true)
    mocks.rpc.mockReset()
    mocks.from.mockReset()
  })

  afterAll(() => {
    syncManager.__setOnlineForTests(false)
    __setDbForTests(null)
    tmp?.cleanup()
  })

  const now = '2026-08-09T12:00:00.000Z'
  function seededTxn(id: string) {
    return {
      id,
      user_id: 'user-1',
      amount: 10,
      direction: 'debit' as const,
      currency_code: 'USD',
      category_id: null,
      merchant: 'Cafe',
      merchant_domain: null,
      note: null,
      payment_method: 'cash' as const,
      amount_in_profile_currency: 10,
      fx_rate_to_profile: 1,
      fx_rate_date: '2026-08-09',
      transacted_at: now,
      source: 'manual' as const,
      raw_transcript: null,
      ai_confidence: null,
      is_recurring: false,
      recurring_rule_id: null,
      recurring_frequency: null,
      client_id: id,
      client_created_at: now,
      version: 1,
      is_deleted: false,
      deleted_at: null,
      synced_at: null,
      created_at: now,
      updated_at: now,
    }
  }

  it('a transaction that would be missing from any particular hook instance\'s React state is still soft-deleted and enqueued — no queue entry is dropped', async () => {
    // Seeded straight into SQLite, exactly like a row written by a
    // different screen's `useTransactions()` instance (or one that arrived
    // via pullRemote/realtime) that this call never loaded into any
    // in-memory list.
    await upsertTransaction(seededTxn('txn-1') as never)

    mocks.from.mockImplementation(() => chain({ data: { id: 'txn-1' }, error: null }))

    const result = await deleteTransactionAndEnqueue('user-1', 'txn-1')

    expect(result.status).toBe('synced')
    expect(result.error).toBeNull()

    const row = await getTransactionById('txn-1')
    expect(row?.is_deleted).toBe(true)
    // version incremented exactly once (by softDeleteTransaction) — not a
    // second time by a stale-state recomputation.
    expect(row?.version).toBe(2)

    assert.equal(mocks.from.mock.calls.length, 1, 'the delete must reach the server exactly once')
    assert.equal(mocks.from.mock.calls[0][0], 'transactions')
  })

  it('a server-side permanent rejection is reported back as "rejected" with the real error, not swallowed as a silent success', async () => {
    await upsertTransaction(seededTxn('txn-2') as never)
    mocks.from.mockImplementation(() =>
      chain({ data: null, error: pgError('42501', 'permission denied') }),
    )

    const result = await deleteTransactionAndEnqueue('user-1', 'txn-2')

    expect(result.status).toBe('rejected')
    expect(result.error).toContain('permission denied')
    expect(await getPendingCount()).toBe(0) // dead-lettered, not stuck pending
  })

  it('deleting an id that never existed locally is a no-op — nothing enqueued', async () => {
    const result = await deleteTransactionAndEnqueue('user-1', 'never-existed')

    expect(result.status).toBe('synced')
    expect(result.error).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(await getPendingCount()).toBe(0)
  })
})
