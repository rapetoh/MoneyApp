import { isPlusFromProfile } from '@voice-expense/shared'
import { useAuth } from './useAuth'
import { useProfile } from './useProfile'

/**
 * Single source of truth for Murmur Plus gating on mobile.
 *
 * Exactly one source: `profile.plus_status === 'active'`. There is no
 * `__DEV__` hatch — audit fix-plan 3.1 deleted it (`isPlus` used to flip
 * true on every debug build, which is how "Free mobile tier is never
 * limited" shipped next to three screens that gate on this same flag).
 * Plus is granted the same way in every build: a manual
 * `profiles.plus_status = 'active'` update (early access) today, and a
 * validated purchase receipt once IAP ships. Mirrors the web resolver at
 * `apps/web/src/lib/plus.server.ts`.
 *
 * Returns `loading: true` while the profile fetch is in flight so
 * Plus-gated screens can suppress flicker (showing the locked state for
 * a frame then unlocking) once the profile resolves.
 */
export function usePlusStatus(): { isPlus: boolean; loading: boolean } {
  const { user } = useAuth()
  const { profile, loading } = useProfile(user?.id)
  return { isPlus: isPlusFromProfile(profile), loading }
}
