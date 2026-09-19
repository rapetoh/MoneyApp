import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import type { Locale, Transaction } from '@voice-expense/shared'
import { dismissPrime, enableCheckIn, rescheduleReminders, shouldOfferPrime } from '../services/reminders'

/** When the user last logged something themselves (auto-generated
 *  recurring rows don't count: they happen without the user). */
export function lastLogTime(transactions: Transaction[]): Date | null {
  let max = 0
  for (const t of transactions) {
    if (t.is_deleted || t.source === 'recurring_generated') continue
    const ts = Date.parse(t.client_created_at ?? t.created_at)
    if (Number.isFinite(ts) && ts > max) max = ts
  }
  return max ? new Date(max) : null
}

/** Expenses the user logged (not income, not auto-generated). */
export function loggedExpenseCount(transactions: Transaction[]): number {
  let n = 0
  for (const t of transactions) {
    if (!t.is_deleted && t.direction === 'debit' && t.source !== 'recurring_generated') n++
  }
  return n
}

/** Lets the save animation and the undo snackbar settle before the sheet rises. */
const PRIME_DELAY_MS = 1400

/**
 * Keeps reminders current and offers the one-time prime sheet.
 *
 * Mounted once, in the tabs layout. Reschedules whenever the last-log time
 * moves and on every return to the foreground (so an active user always
 * has the next 7 evenings covered). When the user logs an expense during
 * this session and was never asked about notifications (accounts that
 * finished onboarding before the habit step existed), it raises the prime
 * sheet: the explanation comes first, the system alert only on Continue.
 */
export function useReminders(locale: Locale, transactions: Transaction[]) {
  const lastLog = useMemo(() => lastLogTime(transactions), [transactions])
  const lastLogMs = lastLog?.getTime() ?? 0

  useEffect(() => {
    void rescheduleReminders(locale, lastLogMs ? new Date(lastLogMs) : null)
  }, [locale, lastLogMs])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void rescheduleReminders(locale)
    })
    return () => sub.remove()
  }, [locale])

  const count = useMemo(() => loggedExpenseCount(transactions), [transactions])
  const prevCount = useRef<number | null>(null)
  const [primeVisible, setPrimeVisible] = useState(false)

  useEffect(() => {
    const prev = prevCount.current
    prevCount.current = count
    if (prev === null || count <= prev) return
    let alive = true
    const timer = setTimeout(() => {
      shouldOfferPrime()
        .then((ok) => {
          if (alive && ok) setPrimeVisible(true)
        })
        .catch(() => {})
    }, PRIME_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [count])

  const acceptPrime = useCallback(async () => {
    setPrimeVisible(false)
    await enableCheckIn(locale)
  }, [locale])

  const declinePrime = useCallback(async () => {
    setPrimeVisible(false)
    await dismissPrime()
  }, [])

  return { primeVisible, acceptPrime, declinePrime }
}
