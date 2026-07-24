import 'server-only'
import { isPlusFromProfile } from '@voice-expense/shared'

/**
 * Server-side resolver for the Plus gate. Read at request time so the
 * runtime env from `~/Library/Application Support/Murmur/.env` (loaded
 * by apps/desktop/src/main.ts before spawning the embedded server)
 * reaches the response.
 *
 * Resolution order:
 *  1. `profile.plus_status === 'active'` — the real source of truth
 *     once IAP / RevenueCat populates the column. Production goes
 *     through this branch.
 *  2. `MURMUR_DEV_PLUS=1` runtime env → unlock everything (desktop
 *     dev override). Lets the packaged dev build exercise gated
 *     surfaces without sandbox subscriptions.
 *  3. `NODE_ENV !== 'production'` → unlock (local dev path).
 *  4. Otherwise locked.
 *
 * Caller passes the profile (server components fetch it once per
 * request — see dashboard/layout.tsx). The function accepts a
 * structural shape so route handlers that haven't loaded a full
 * Profile yet can still pass `null` and lean on the env hatches.
 */
export function resolvePlusStatus(
  profile?: { plus_status?: 'active' | 'lapsed' | 'free' | null } | null,
): { isPlus: boolean } {
  if (isPlusFromProfile(profile)) return { isPlus: true }
  if (process.env.MURMUR_DEV_PLUS === '1') return { isPlus: true }
  if (process.env.NODE_ENV !== 'production') return { isPlus: true }
  return { isPlus: false }
}
