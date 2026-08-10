/**
 * Regression test for audit 07-F15: root layout re-ran recurring catch-up,
 * FX backfill and category seeding on every navigation because they lived
 * inside an effect whose dependency array included `segments`. The fix
 * moved them to their own effect keyed on `session?.user?.id` and wrapped
 * every call in `runOncePerSession` — this file pins that guard's own
 * contract directly, independent of `app/_layout.tsx` (which isn't
 * reachable from this package's `src/**\/*.test.ts`-scoped Vitest config).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runOncePerSession, hasRunOncePerSession, __resetRunOncePerSessionForTests } from '../launchOnce'

describe('runOncePerSession', () => {
  beforeEach(() => {
    __resetRunOncePerSessionForTests()
  })

  it('invokes fn exactly once across four calls with the same key — the "navigate four times" case from 07-F15', async () => {
    const fn = vi.fn(async () => 'ok')

    // Mirrors four navigations firing the effect four times with an
    // unchanged key (same user id).
    runOncePerSession('seedDefaultCategories:user-1', fn)
    runOncePerSession('seedDefaultCategories:user-1', fn)
    runOncePerSession('seedDefaultCategories:user-1', fn)
    runOncePerSession('seedDefaultCategories:user-1', fn)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('re-arms for a different key — signing out and in as a different user', () => {
    const fnA = vi.fn(async () => undefined)
    const fnB = vi.fn(async () => undefined)

    runOncePerSession('seedDefaultCategories:user-1', fnA)
    runOncePerSession('seedDefaultCategories:user-2', fnB)

    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).toHaveBeenCalledTimes(1)
  })

  it('marks the key as started synchronously, before the async fn resolves', () => {
    let resolveFn: () => void = () => {}
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFn = resolve
        }),
    )

    expect(hasRunOncePerSession('slow-service:user-1')).toBe(false)
    runOncePerSession('slow-service:user-1', fn)
    expect(hasRunOncePerSession('slow-service:user-1')).toBe(true)

    // A second call arriving before the first resolves must still no-op.
    runOncePerSession('slow-service:user-1', fn)
    expect(fn).toHaveBeenCalledTimes(1)

    resolveFn()
  })

  it('one key rejecting does not throw an unhandled rejection and does not block a different key', async () => {
    const failing = vi.fn(async () => {
      throw new Error('boom')
    })
    const succeeding = vi.fn(async () => 'ok')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    runOncePerSession('runRecurringCatchUp:user-1', failing)
    runOncePerSession('runFxBackfill:user-1', succeeding)

    // Let both microtask chains settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(failing).toHaveBeenCalledTimes(1)
    expect(succeeding).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('runRecurringCatchUp:user-1'), expect.any(Error))

    warn.mockRestore()
  })
})
