/**
 * Single source of truth for Murmur Plus gating.
 *
 * Until IAP wiring lands and a `profile.plus_status` column is populated by
 * receipt validation, this hook returns true only when running a development
 * build with `EXPO_PUBLIC_FORCE_PLUS=1`. Production users always see the
 * paywall — the entry screen + paywall ship today, the actual purchase flow
 * comes with the next phase.
 *
 * When IAP lands, replace the body with a read of the user's profile column
 * (and a still-respected dev override for local testing).
 */
export function usePlusStatus(): { isPlus: boolean; loading: boolean } {
  const forcePlus =
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_FORCE_PLUS === '1'
  return { isPlus: forcePlus, loading: false }
}
