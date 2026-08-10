/**
 * Regression tests for the `devices` table finally being written
 * (fix-plan 3.7). The table (migration 001) has always existed with a
 * `user_id`-scoped RLS policy; before this module nothing ever wrote to
 * it, which is what let the web sidebar and web Settings hardcode
 * "Synced just now".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const secureStoreMocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(secureStoreMocks.store.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    secureStoreMocks.store.set(key, value)
    return Promise.resolve()
  }),
}))

let uuidCounter = 0
vi.mock('expo-crypto', () => ({ randomUUID: () => `generated-uuid-${++uuidCounter}` }))

vi.mock('expo-constants', () => ({ default: { deviceName: 'Roch’s iPhone' } }))

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}))
vi.mock('../../../lib/supabase', () => ({ supabase: { from: supabaseMocks.from } }))

const { getDeviceId, registerDevice, touchDeviceSynced, getDeviceLastSynced, __resetDeviceRegistryForTests } =
  await import('../deviceRegistry')

/** Chainable stub mirroring supabase-js's thenable query builder closely
 *  enough for these tests. */
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.eq = self
  builder.select = self
  builder.update = self
  builder.upsert = () => Promise.resolve(result)
  builder.maybeSingle = () => Promise.resolve(result)
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return builder
}

beforeEach(() => {
  secureStoreMocks.store.clear()
  uuidCounter = 0
  supabaseMocks.from.mockReset()
  __resetDeviceRegistryForTests()
})

describe('getDeviceId', () => {
  it('generates a UUID once and persists it in SecureStore', async () => {
    const id = await getDeviceId()
    expect(id).toBe('generated-uuid-1')
    expect(secureStoreMocks.store.get('murmur_device_id_v1')).toBe('generated-uuid-1')
  })

  it('reuses the persisted id on a later call rather than generating a new one', async () => {
    const first = await getDeviceId()
    __resetDeviceRegistryForTests() // simulate a fresh process, same device (SecureStore survives)
    const second = await getDeviceId()
    expect(second).toBe(first)
    expect(uuidCounter).toBe(1) // randomUUID only ever called once
  })
})

describe('registerDevice', () => {
  it('upserts id/user_id/platform/device_name/last_seen_at', async () => {
    supabaseMocks.from.mockImplementation((table: string) => {
      expect(table).toBe('devices')
      return chain({ data: null, error: null })
    })
    await registerDevice('user-1')
    expect(supabaseMocks.from).toHaveBeenCalledWith('devices')
  })

  it('does not throw when the upsert fails — best-effort, never blocks launch', async () => {
    supabaseMocks.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    await expect(registerDevice('user-1')).resolves.toBeUndefined()
  })
})

describe('touchDeviceSynced', () => {
  it('updates last_synced_at scoped to this device id and user id', async () => {
    const updateSpy = vi.fn(() => chain({ data: null, error: null }))
    supabaseMocks.from.mockReturnValue({ update: updateSpy, eq: () => chain({ data: null, error: null }) })
    await touchDeviceSynced('user-1')
    expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ last_synced_at: expect.any(String) }))
  })
})

describe('getDeviceLastSynced', () => {
  it('returns the stamped timestamp', async () => {
    supabaseMocks.from.mockReturnValue(
      chain({ data: { last_synced_at: '2026-08-08T12:00:00.000Z' }, error: null }),
    )
    expect(await getDeviceLastSynced('user-1')).toBe('2026-08-08T12:00:00.000Z')
  })

  it('returns null on a read error rather than throwing', async () => {
    supabaseMocks.from.mockReturnValue(chain({ data: null, error: { message: 'boom' } }))
    expect(await getDeviceLastSynced('user-1')).toBeNull()
  })
})
