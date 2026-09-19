import { useCallback, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import type { Transaction } from '@voice-expense/shared'
import { cacheSet, useCachedState } from '../services/queryCache'
import { loggedExpenseCount } from './useReminders'

const KEY_DAYONE = 'dayone_skipped'
/** '1' while the card is collapsed to its one-line summary. Collapsing is
 *  reversible on purpose: a mis-tap must never cost the user the card
 *  (owner review, Sep 19 2026). */
export const KEY_CHECKLIST_COLLAPSED = 'start_checklist_collapsed'
/** Written by onboarding's last step, consumed once by the tabs layout. */
export const KEY_ONBOARDING_FOLLOWUP = 'onboarding_followup'
export type OnboardingFollowup = 'plus' | 'applepay'

const cacheKey = (key: string) => `firstrun:${key}`

/**
 * Set a first-run flag from outside a component (onboarding's last step).
 *
 * It must write through the shared cache, not only to SecureStore: the
 * Today screen mounts for a moment at launch, before the routing gate
 * sends a new user into onboarding, and that mount caches "not set". The
 * hook below never re-reads a key the cache already holds, so a plain
 * SecureStore write stayed invisible until the next cold start, which is
 * how the "Getting started" card went missing on the first run.
 */
export function setFirstRunFlag(key: string, value: boolean): Promise<void> {
  cacheSet(cacheKey(key), value)
  const write = value ? SecureStore.setItemAsync(key, '1') : SecureStore.deleteItemAsync(key)
  return write.catch(() => {})
}

/** A persisted boolean shared by every mounted screen (queryCache), so the
 *  Today screen and the tabs layout's mic button agree on the same frame. */
function usePersistedFlag(key: string): [boolean, boolean, (next: boolean) => void] {
  const [value, setValue, has] = useCachedState<boolean>(cacheKey(key), false)
  useEffect(() => {
    if (has) return
    SecureStore.getItemAsync(key)
      .then((v) => setValue(v === '1'))
      .catch(() => setValue(false))
  }, [has, key, setValue])
  const set = useCallback(
    (next: boolean) => {
      void setFirstRunFlag(key, next)
    },
    [key],
  )
  return [value, has, set]
}

/**
 * First-run state (audit C3, L1, Sep 19 2026).
 *
 * The Day-1 coach used to depend on "zero transactions", so anyone whose
 * first transaction was an income never saw it; now it shows until the
 * user has logged an *expense*, and skipping it persists across launches.
 * `dayOneActive` is read by both the Today screen (the coach) and the tabs
 * layout (the glow on the mic button it points at).
 */
/**
 * Whether the "Getting started" card belongs on Today at all.
 *
 * Read from the account (profiles.onboarding_completed_at), never from a
 * flag on the device (owner report, Sep 19 2026): deleting an app wipes
 * its keychain on iOS, so a device flag disappeared on reinstall and the
 * card never came back for an account that had just been set up. The
 * account knows when it was onboarded; every device it signs into agrees.
 *
 * It is first-week guidance, not furniture, so it retires once the user is
 * clearly past that stage, even with items left undone (those live in
 * Budgets and Settings anyway).
 */
export function shouldRetireChecklist(
  expenses: number,
  onboardingCompletedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expenses >= RETIRE_AFTER_EXPENSES) return true
  if (!onboardingCompletedAt) return false
  const started = Date.parse(onboardingCompletedAt)
  if (!Number.isFinite(started)) return false
  return now.getTime() - started >= RETIRE_AFTER_DAYS * 86_400_000
}

const RETIRE_AFTER_EXPENSES = 10
const RETIRE_AFTER_DAYS = 14

export function useFirstRun(transactions: Transaction[], onboardingCompletedAt?: string | null) {
  const [dayOneSkipped, dayOneLoaded, setDayOneSkipped] = usePersistedFlag(KEY_DAYONE)
  const [checklistCollapsed, , setChecklistCollapsed] = usePersistedFlag(KEY_CHECKLIST_COLLAPSED)
  const expenses = loggedExpenseCount(transactions)

  return {
    expenses,
    dayOneActive: dayOneLoaded && !dayOneSkipped && expenses === 0,
    skipDayOne: () => setDayOneSkipped(true),
    checklistVisible: !!onboardingCompletedAt && !shouldRetireChecklist(expenses, onboardingCompletedAt),
    checklistCollapsed,
    toggleChecklistCollapsed: () => setChecklistCollapsed(!checklistCollapsed),
  }
}

export async function takeOnboardingFollowup(): Promise<OnboardingFollowup | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY_ONBOARDING_FOLLOWUP)
    if (!v) return null
    await SecureStore.deleteItemAsync(KEY_ONBOARDING_FOLLOWUP)
    return v === 'applepay' ? 'applepay' : 'plus'
  } catch {
    return null
  }
}
