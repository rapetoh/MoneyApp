import 'server-only'

/**
 * Server-side resolver for the Plus gate. Read at request time so the
 * runtime env from `~/Library/Application Support/Murmur/.env` (loaded
 * by apps/desktop/src/main.ts before spawning the embedded server)
 * reaches the response.
 *
 * Resolution order:
 *  1. `MURMUR_DEV_PLUS=1` runtime env → unlock everything (current
 *     dev/desktop override until IAP wiring lands).
 *  2. `NODE_ENV !== 'production'` → unlock (next dev path).
 *  3. Otherwise locked. Real entitlement lookup against
 *     `profile.plus_status` will live here once RevenueCat ships.
 */
export function resolvePlusStatus(): { isPlus: boolean } {
  if (process.env.MURMUR_DEV_PLUS === '1') return { isPlus: true }
  if (process.env.NODE_ENV !== 'production') return { isPlus: true }
  return { isPlus: false }
}
