'use client'
import { useEffect, useRef } from 'react'
import { createClient } from './supabase/client'

/**
 * One realtime subscription: `table` filtered by `filter` (a
 * `postgres_changes` filter string, e.g. `user_id=eq.<uuid>`), invoking
 * `onChange` on every INSERT/UPDATE/DELETE. Subscribes once `filter` is
 * non-null — callers resolve the user id themselves, which they already
 * need for their own initial `load()` — and re-subscribes if `table` or
 * `filter` change. Always unsubscribes on unmount.
 *
 * Replaces three hand-rolled per-page shapes (fix-plan 4.6, audit 08-F50
 * follow-up): Transactions' and Budgets' pages each got the cleanup right
 * but duplicated the ~25-line shape independently; Recurring's returned
 * its `channel.unsubscribe()` from *inside* an async IIFE, where the
 * `useEffect`'s real (synchronous) return value — the only thing React
 * ever calls on unmount — was just `() => { active = false }`. The
 * channel was never unsubscribed; every mount/unmount of the Recurring
 * page leaked one realtime channel.
 */
export function useRealtime(table: string, filter: string | null, onChange: () => void): void {
  // Ref so a caller passing an inline arrow function doesn't force a
  // resubscribe every render — only `table`/`filter` identity should do
  // that.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!filter) return
    const supabase = createClient()
    // Random suffix — React Strict Mode's double-invoke must not collide
    // with itself on the same channel name (matches all three prior
    // shapes' own reasoning).
    const channel = supabase
      .channel(`web:${table}:${filter}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => onChangeRef.current(),
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [table, filter])
}
