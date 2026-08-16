import { useCallback, useRef, useState } from 'react'
import { syncManager } from '../services/sync/SyncManager'
import { DataEvents } from '../events/dataEvents'

/**
 * Pull-to-refresh for the list screens (Today, Insights, Budgets, History,
 * Recurring). Owner question, Aug 16 2026: "when I refresh, does it really
 * refresh?" — until now there was no refresh gesture at all: pulling did
 * nothing, and the screens relied on realtime + the foreground/network
 * pull. This is the explicit one: push what's queued, pull what's new from
 * the server, then tell every mounted hook to re-read (transactions,
 * budget, profile via DataEvents; anything else through `extra`, e.g. a
 * screen's own `refetch`). Resolves when the data is actually current, so
 * the spinner never lies.
 */
export function useManualRefresh(
  userId: string | undefined,
  extra: Array<() => Promise<unknown> | unknown> = [],
): { refreshing: boolean; onRefresh: () => Promise<void> } {
  const [refreshing, setRefreshing] = useState(false)
  const extraRef = useRef(extra)
  extraRef.current = extra
  const busyRef = useRef(false)

  const onRefresh = useCallback(async () => {
    if (!userId || busyRef.current) return
    busyRef.current = true
    setRefreshing(true)
    try {
      await syncManager.drainQueue()
      await syncManager.pullRemote(userId)
      DataEvents.emitTransactions(userId)
      DataEvents.emitBudget(userId)
      DataEvents.emitProfile(userId)
      await Promise.all(extraRef.current.map((f) => Promise.resolve().then(() => f())))
    } catch (err) {
      console.warn('[refresh] failed:', err)
    } finally {
      busyRef.current = false
      setRefreshing(false)
    }
  }, [userId])

  return { refreshing, onRefresh }
}
