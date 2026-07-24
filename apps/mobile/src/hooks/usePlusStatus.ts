import { isPlusFromProfile } from '@voice-expense/shared'
import { useAuth } from './useAuth'
import { useProfile } from './useProfile'

/**
 * Single source of truth for Murmur Plus gating on mobile.
 *
 * Resolution order:
 *   1. `profile.plus_status === 'active'` — populated by IAP /
 *      RevenueCat receipt validation. Production goes through this.
 *   2. `__DEV__` — keeps the developer + QA loop open until IAP
 *      lands; lets `isPlus` flip true on a debug build without
 *      spinning up sandbox subscriptions.
 *   3. Otherwise false — production users on a free profile see the
 *      paywall on every gated surface.
 *
 * Returns `loading: true` while the profile fetch is in flight so
 * Plus-gated screens can suppress flicker (showing the paywall for a
 * frame then unlocking) once the profile resolves.
 */
export function usePlusStatus(): { isPlus: boolean; loading: boolean } {
  const { user } = useAuth()
  const { profile, loading } = useProfile(user?.id)
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__
  const fromProfile = isPlusFromProfile(profile)
  return { isPlus: fromProfile || isDev, loading }
}
