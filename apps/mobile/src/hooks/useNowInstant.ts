import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { localDay } from '@voice-expense/shared'

/**
 * "Now" for date-derived screens: stable within a local day, and moved
 * forward when the day changes.
 *
 * Oct 5 2026, owner screenshot at 5:48 AM Monday: Today still read
 * "TODAY · SUNDAY" and Spent Today counted Sunday's purchases. Today,
 * Insights, Budgets and the history heatmap each froze `now` at mount with
 * `useMemo(() => new Date().toISOString(), [])`, so an app that stayed alive
 * in the background across midnight (normal on iOS) kept yesterday as
 * today until it was killed.
 *
 * Kept as a single value rather than a ticking clock so every figure in one
 * render still agrees with every other (the reason the memo existed). It
 * advances at the next local midnight while the app is open, and on every
 * return to the foreground if the local day changed meanwhile.
 */
export function useNowInstant(tz: string): string {
  const [now, setNow] = useState(() => new Date().toISOString())

  useEffect(() => {
    const refreshIfNewDay = () => {
      const fresh = new Date().toISOString()
      setNow((prev) => (localDay(prev, tz) === localDay(fresh, tz) ? prev : fresh))
    }
    refreshIfNewDay()

    // Check once a minute rather than computing the exact midnight in `tz`:
    // cheap, immune to DST edge cases, and the most a stale day can last.
    const timer = setInterval(refreshIfNewDay, 60_000)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshIfNewDay()
    })
    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [tz])

  return now
}
