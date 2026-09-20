import { useEffect } from 'react'
import { AppState } from 'react-native'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { registerPushToken, subscribePushNavigation } from '../services/pushTokens'
import { t, type Locale } from '@voice-expense/shared'

/**
 * Keeps this device registered for push, and routes taps.
 *
 * Re-registers on every foreground, not just at mount. Expo push tokens
 * rotate, a user can grant notifications in system Settings while the app
 * is backgrounded, and a reinstall needs its retired row revived. All
 * three only show up on the way back in, and the call is a cached no-op
 * whenever nothing changed.
 */
export function usePushRegistration(userId: string | undefined, locale: Locale) {
  useEffect(() => {
    if (!userId) return
    const opts = {
      locale,
      appVersion: Constants.expoConfig?.version ?? undefined,
      // Android files each family under its own channel so one can be
      // muted without the others. The names have to be readable: this is
      // what the user sees in system notification settings.
      channelLabels: {
        money: t('notifsettings.family_money', locale),
        bill: t('notifsettings.family_bills', locale),
        budget: t('notifsettings.family_budget', locale),
        receipt: t('notifsettings.family_receipts', locale),
        insight: t('notifsettings.family_insights', locale),
        habit: t('notifsettings.family_habit', locale),
      },
    }
    void registerPushToken(userId, opts)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void registerPushToken(userId, opts)
    })
    return () => sub.remove()
  }, [userId, locale])

  const router = useRouter()
  useEffect(() => {
    return subscribePushNavigation((path) => router.push(path as never))
  }, [router])
}
