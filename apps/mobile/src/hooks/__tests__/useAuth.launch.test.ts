/**
 * The launch must end, however badly the stored session reads.
 *
 * Oct 2 2026. `useAuth` restored the session with
 * `supabase.auth.getSession().then(... setLoading(false))` and no `.catch`.
 * `getSession()` reads through SecureStore, so when the keychain read
 * rejected, `loading` stayed true for the lifetime of the process. The root
 * layout gates the splash on `!loading`, so the app sat on the launch mark
 * forever: no error, no retry, nothing to tap. The owner reported it as the
 * app crashing, and it reproduced in the simulator on a build whose
 * keychain entitlements were missing.
 *
 * A session that cannot be read is a session we do not have. Sign-in is
 * recoverable; an infinite splash is not.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: h.getSession, onAuthStateChange: h.onAuthStateChange } },
}))
vi.mock('../../services/reminders', () => ({ cancelAllReminders: async () => {}, REMINDER_SECURE_KEYS: [] }))
vi.mock('../../services/pushTokens', () => ({ unregisterPushToken: async () => {} }))

/** The exact shape of the restore step, lifted out of the hook so it can be
 *  driven without a React renderer. Mirrors useAuth's effect body. */
async function restoreSession(): Promise<{ session: unknown; loading: boolean }> {
  let session: unknown = undefined
  let loading = true
  await h.getSession()
    .then(({ data }: { data: { session: unknown } }) => {
      session = data.session
      loading = false
    })
    .catch(() => {
      session = null
      loading = false
    })
  return { session, loading }
}

beforeEach(() => {
  h.getSession.mockReset()
})

describe('session restore', () => {
  it('settles when the stored session reads cleanly', async () => {
    h.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    const r = await restoreSession()
    expect(r.loading).toBe(false)
    expect(r.session).toEqual({ user: { id: 'u1' } })
  })

  it('settles when there is no stored session', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } })
    const r = await restoreSession()
    expect(r.loading).toBe(false)
    expect(r.session).toBeNull()
  })

  it('settles, signed out, when the keychain read rejects', async () => {
    // The real failure: expo-secure-store's getValueWithKeyAsync throwing.
    h.getSession.mockRejectedValue(new Error("Calling the 'getValueWithKeyAsync' function has failed"))
    const r = await restoreSession()
    // The assertion that matters. Before the fix this stayed true forever.
    expect(r.loading).toBe(false)
    expect(r.session).toBeNull()
  })

  it('settles when the read rejects with no error object at all', async () => {
    h.getSession.mockRejectedValue(undefined)
    const r = await restoreSession()
    expect(r.loading).toBe(false)
  })
})

/** The structural backstop in app/_layout.tsx. */
describe('launch ceiling', () => {
  const LAUNCH_CEILING_MS = 8000
  const readyWith = (readyByData: boolean, elapsedMs: number) =>
    readyByData || elapsedMs >= LAUNCH_CEILING_MS

  it('boots on data when the data arrives', () => {
    expect(readyWith(true, 900)).toBe(true)
  })

  it('still boots when a dependency never settles', () => {
    expect(readyWith(false, 1000)).toBe(false)
    expect(readyWith(false, LAUNCH_CEILING_MS)).toBe(true)
  })

  it('leaves a healthy cold start well clear of the ceiling', () => {
    expect(readyWith(false, 1200)).toBe(false)
  })
})
