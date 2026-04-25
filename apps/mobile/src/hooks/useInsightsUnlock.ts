import { useEffect, useState, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'

/**
 * Day-3 Insights unlock badge (per DESIGN.md §"Retention mechanics").
 *
 * Once the user has logged 3+ transactions, the Insights tab icon shows a
 * small sage dot the first time they have unread insights to discover. The
 * badge clears the moment the user opens Insights — this is a one-time
 * "first reveal" affordance, not a persistent notification dot.
 *
 * State machine:
 *   - txnCount < 3: locked. badge=false.
 *   - txnCount >= 3 AND user has not yet opened Insights since unlock: badge=true.
 *   - User opens Insights → markSeen() flips the SecureStore flag → badge=false forever.
 *
 * Stored under SecureStore key `insights_unlocked_seen` so it survives sign-out
 * (it's a device-level UX milestone, not user-account data).
 */

const STORAGE_KEY = 'insights_unlocked_seen'
const UNLOCK_THRESHOLD = 3

interface UseInsightsUnlockResult {
  /** True when the badge should render on the Insights tab icon. */
  badge: boolean
  /** True when this is the user's first eligible visit to Insights —
   *  callers can use this to render a one-screen welcome card. */
  showWelcome: boolean
  /** Call when the user actually views Insights. Idempotent. */
  markSeen: () => Promise<void>
}

export function useInsightsUnlock(txnCount: number): UseInsightsUnlockResult {
  const [seen, setSeen] = useState<boolean | null>(null)

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((v) => {
      setSeen(v === '1')
    })
  }, [])

  const markSeen = useCallback(async () => {
    if (seen) return
    await SecureStore.setItemAsync(STORAGE_KEY, '1')
    setSeen(true)
  }, [seen])

  // While the SecureStore read is in flight, render conservatively (no
  // badge, no welcome) so the tab icon doesn't flash on every cold start.
  if (seen === null) return { badge: false, showWelcome: false, markSeen }

  const eligible = txnCount >= UNLOCK_THRESHOLD && !seen
  return { badge: eligible, showWelcome: eligible, markSeen }
}
