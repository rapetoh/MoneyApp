import { useCallback, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import type { Transaction } from '@voice-expense/shared'
import { useCachedState } from '../services/queryCache'
import { loggedExpenseCount } from './useReminders'

const KEY_DAYONE = 'dayone_skipped'
/** '1' while the "Getting started" card should show. Set by onboarding's
 *  last step, so accounts onboarded before this card existed never get a
 *  checklist dropped on their Today screen; cleared by Hide. */
export const KEY_CHECKLIST = 'start_checklist_active'
/** Written by onboarding's last step, consumed once by the tabs layout. */
export const KEY_ONBOARDING_FOLLOWUP = 'onboarding_followup'
export type OnboardingFollowup = 'plus' | 'applepay'

/** A persisted boolean shared by every mounted screen (queryCache), so the
 *  Today screen and the tabs layout's mic button agree on the same frame. */
function usePersistedFlag(key: string): [boolean, boolean, (next: boolean) => void] {
  const [value, setValue, has] = useCachedState<boolean>(`firstrun:${key}`, false)
  useEffect(() => {
    if (has) return
    SecureStore.getItemAsync(key)
      .then((v) => setValue(v === '1'))
      .catch(() => setValue(false))
  }, [has, key, setValue])
  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      const write = next ? SecureStore.setItemAsync(key, '1') : SecureStore.deleteItemAsync(key)
      write.catch(() => {})
    },
    [key, setValue],
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
export function useFirstRun(transactions: Transaction[]) {
  const [dayOneSkipped, dayOneLoaded, setDayOneSkipped] = usePersistedFlag(KEY_DAYONE)
  const [checklistActive, checklistLoaded, setChecklistActive] = usePersistedFlag(KEY_CHECKLIST)
  const expenses = loggedExpenseCount(transactions)
  return {
    expenses,
    dayOneActive: dayOneLoaded && !dayOneSkipped && expenses === 0,
    skipDayOne: () => setDayOneSkipped(true),
    checklistVisible: checklistLoaded && checklistActive,
    hideChecklist: () => setChecklistActive(false),
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
