import { useCallback, useEffect, useReducer } from 'react'

/**
 * Process-lifetime, per-key memory store shared by every data hook instance.
 *
 * Why (build 12 feedback — "screens show the previous information, then
 * half a second later the current information"): every `useTransactions` /
 * `useCategories` / `useProfile` / `useActiveBudget` / `useRecurringRules`
 * call used to start from an empty `useState` and refetch — SQLite for
 * transactions, the *network* for the other four — on every screen mount.
 * So each navigation rendered a first frame with no categories (rows
 * without chips), default currency/locale, `$0.00` aggregates, and an
 * empty rule list, then re-rendered as each fetch landed.
 *
 * Now the last known value for each key lives here. A hook instance reads
 * it synchronously on first render (no empty frame), still refreshes in
 * the background, and writes the result back — which notifies every other
 * mounted instance of the same key, so cross-screen updates are immediate
 * and every screen agrees. Cleared on sign-out (`resetLocalState`).
 */
type Listener = () => void

const values = new Map<string, unknown>()
const listeners = new Map<string, Set<Listener>>()

export function cacheHas(key: string): boolean {
  return values.has(key)
}

export function cacheSet<T>(key: string, value: T): void {
  values.set(key, value)
  listeners.get(key)?.forEach((fn) => fn())
}

export function cacheClear(): void {
  values.clear()
  // Listeners stay subscribed — the hooks are still mounted; they simply
  // re-render onto their fallbacks and refetch under the next user.
  listeners.forEach((set) => set.forEach((fn) => fn()))
}

function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(fn)
  return () => {
    set!.delete(fn)
    if (set!.size === 0) listeners.delete(key)
  }
}

/**
 * `useState` whose value is shared across every instance using the same
 * key. Returns `[value, setValue, hasValue]` — `hasValue` is false only
 * until the first `setValue` for that key in this process, which is the
 * one moment a hook should report `loading`.
 */
export function useCachedState<T>(key: string | null, fallback: T): [T, (value: T) => void, boolean] {
  const [, force] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    if (!key) return
    return subscribe(key, force)
  }, [key])

  const has = key != null && values.has(key)
  const value = has ? (values.get(key) as T) : fallback

  const set = useCallback(
    (next: T) => {
      if (key) cacheSet(key, next)
    },
    [key],
  )

  return [value, set, has]
}
