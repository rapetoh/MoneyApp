/**
 * Regression test for the missing "Getting started" card (owner report,
 * Sep 19 2026, build 49).
 *
 * At launch the Today screen mounts for a moment before the routing gate
 * sends a new user into onboarding, and that mount caches "flag not set"
 * in the shared query cache. `usePersistedFlag` never re-reads a key the
 * cache already holds, so onboarding's plain SecureStore write stayed
 * invisible until the next cold start. `setFirstRunFlag` must therefore
 * write through the cache as well as to storage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => new Map<string, string>())

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    store.delete(key)
  },
}))

// Cuts the react-native import chain (useReminders -> AppState); this file
// only exercises the flag helper.
vi.mock('../useReminders', () => ({ loggedExpenseCount: () => 0 }))

const { setFirstRunFlag, KEY_CHECKLIST } = await import('../useFirstRun')
const { cacheSet, cacheClear, cacheHas, cacheGet } = await import('../../services/queryCache')

const CACHE_KEY = `firstrun:${KEY_CHECKLIST}`

beforeEach(() => {
  store.clear()
  cacheClear()
})

describe('setFirstRunFlag', () => {
  it('updates the shared cache immediately, not only storage', async () => {
    // What the early Today mount leaves behind: the flag read as unset.
    cacheSet(CACHE_KEY, false)

    await setFirstRunFlag(KEY_CHECKLIST, true)

    expect(cacheHas(CACHE_KEY)).toBe(true)
    // The screens already mounted must see it on this launch.
    expect(cacheGet(CACHE_KEY)).toBe(true)
    expect(store.get(KEY_CHECKLIST)).toBe('1')
  })

  it('clearing removes it from both', async () => {
    await setFirstRunFlag(KEY_CHECKLIST, true)
    await setFirstRunFlag(KEY_CHECKLIST, false)
    expect(cacheGet(CACHE_KEY)).toBe(false)
    expect(store.has(KEY_CHECKLIST)).toBe(false)
  })
})
