import 'server-only'
import { isPlusFromProfile } from '@voice-expense/shared'

/**
 * Server-side resolver for the Plus gate.
 *
 * Exactly one source of truth: `profile.plus_status === 'active'`,
 * populated by IAP / RevenueCat. There is no env-based unlock — the
 * old `MURMUR_DEV_PLUS=1` runtime hatch and the `NODE_ENV !==
 * 'production'` hatch both unlocked every paid surface for anyone who
 * could write to (or simply not set) an env var, which is exactly the
 * class of person this gate exists to stop. Deleted by audit fix 0.4.
 *
 * Caller passes the profile (server components fetch it once per
 * request — see dashboard/layout.tsx). Route handlers that haven't
 * loaded a full Profile yet pass `null`, which resolves to locked.
 */
export function resolvePlusStatus(
  profile?: { plus_status?: 'active' | 'lapsed' | 'free' | null } | null,
): { isPlus: boolean } {
  if (isPlusFromProfile(profile)) return { isPlus: true }
  return { isPlus: false }
}
