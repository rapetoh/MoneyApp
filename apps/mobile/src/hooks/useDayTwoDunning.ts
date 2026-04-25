import { useEffect, useRef } from 'react'
import type { Transaction, Locale } from '@voice-expense/shared'
import {
  ensureDayTwoPermissionAndSchedule,
  rescheduleDayTwo,
  cancelDayTwo,
} from '../services/dayTwoDunning'

/**
 * Day-2 dunning lifecycle, hooked at the tabs layout so it sees every
 * transaction-list change.
 *
 * Behavior:
 *   - First transaction ever (list grew from 0 → 1): prompt for
 *     notification permission, then schedule the 24h dunning.
 *   - Subsequent transactions (list grew by ≥1): silently reschedule the
 *     dunning to fire 24h from this latest activity. Prompts are NOT
 *     re-issued — once permission is granted (or denied), we don't pester.
 *   - List shrinks (user deleted a transaction): no-op. Deletes are an
 *     intent the user already understood; they shouldn't reset the clock.
 *   - Empty list (user wiped everything or never logged): cancel any
 *     pending notification — no point reminding someone with no history
 *     of any pattern.
 *
 * `seenLengthRef` is null on first render (we don't fire the prompt on a
 * cold start with already-existing transactions — only on the *transition*
 * from one count to a higher one within a session). This prevents the
 * permission dialog from popping up on every app launch.
 */
export function useDayTwoDunning(
  locale: Locale,
  transactions: Transaction[],
): void {
  const seenLengthRef = useRef<number | null>(null)

  useEffect(() => {
    const len = transactions.filter((t) => !t.is_deleted).length

    // Initial render — seed the ref but don't fire anything. Existing-user
    // launches should not re-prompt.
    if (seenLengthRef.current === null) {
      seenLengthRef.current = len
      // If there are already transactions, ensure dunning is scheduled
      // (covers the case where the user granted permission on a previous
      // launch and the OS cleared scheduled notifications). Best-effort.
      if (len > 0) void rescheduleDayTwo(locale)
      return
    }

    const prevLen = seenLengthRef.current
    seenLengthRef.current = len

    if (len === 0) {
      // User wiped to empty — cancel any pending nudge.
      void cancelDayTwo()
      return
    }

    if (len > prevLen) {
      // New transaction this session.
      if (prevLen === 0) {
        // First-ever transaction. Now's the moment to ask for permission —
        // the user has just experienced the value of capture, so the
        // "we'll remind you tomorrow" pitch lands. ensureDayTwoPermission*
        // is no-op-on-deny, so subsequent first-transactions on a denied
        // device don't loop.
        void ensureDayTwoPermissionAndSchedule(locale)
      } else {
        // Repeat user — reschedule silently.
        void rescheduleDayTwo(locale)
      }
    }
    // len === prevLen or len < prevLen: no-op. The prevLen-decrease branch
    // covers soft-delete shrinking the list; no action needed.
  }, [transactions, locale])
}
