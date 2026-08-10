/**
 * Runs `fn` at most once per distinct `key` for the lifetime of the JS
 * process — i.e. once per signed-in session, not once per navigation or
 * per re-render (audit `07-F15`).
 *
 * `apps/mobile/app/_layout.tsx` used to call
 * `seedDefaultCategories`/`runRecurringCatchUp`/`runFxBackfill` directly
 * inside its routing effect, whose dependency array includes `segments` —
 * `useSegments()` returns a new array on every route change, so all three
 * re-ran (and re-issued their Supabase round-trips) on every tab switch
 * and every screen push. Two overlapping `runRecurringCatchUp` invocations
 * could both pass the "does this occurrence already exist" check before
 * either had written, producing duplicate-generation churn;
 * `seedDefaultCategories` issuing two queries per navigation is the direct
 * cause of the `categories_user_id_name_normalized_key` violations 3ms
 * apart the audit found in the production log. The same re-arm-on-every-
 * mount shape is also what turned one dunning notification into an
 * orphaned duplicate (see `dayTwoDunning.ts`'s own queue) — this module
 * is the general-purpose version of that guard for launch-time services.
 *
 * Keyed on a caller-supplied string (e.g. `` `seedDefaultCategories:${userId}` ``)
 * rather than a bare boolean so signing out and back in as a *different*
 * user re-arms correctly, and a launch that never signs in never starts
 * anything.
 */
const launched = new Map<string, Promise<unknown>>()

export function runOncePerSession(key: string, fn: () => Promise<unknown>): void {
  if (launched.has(key)) return
  launched.set(
    key,
    fn().catch((err) => {
      // One service failing must not throw an unhandled rejection, and
      // must not block any other key — each is an independent call, not
      // a chain, so a rejection here only affects its own entry.
      console.warn(`[launchOnce] ${key} failed`, err)
    }),
  )
}

/** True once `key` has been started via `runOncePerSession` — regardless
 *  of whether it has resolved yet. Exposed for tests and for callers that
 *  want to know without triggering a run. */
export function hasRunOncePerSession(key: string): boolean {
  return launched.has(key)
}

/** Test-only: clears the module-level cache so each test starts from a
 *  clean process-lifetime state. Not for use from app code — a real
 *  launch has exactly one process lifetime. */
export function __resetRunOncePerSessionForTests(): void {
  launched.clear()
}
