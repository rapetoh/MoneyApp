/**
 * Single source of truth for Murmur Plus gating.
 *
 * Until IAP / RevenueCat wiring lands and a `profile.plus_status` column is
 * populated by receipt validation:
 *
 *   - In `__DEV__` builds, every user is treated as Plus so the developer +
 *     internal QA can exercise the full Plus surface (Ask Murmur, auto
 *     recurring detection, export, eventual desktop) without spinning up
 *     sandbox subscriptions or env-var dances. The paywall is still
 *     reachable for visual review — Plus is just satisfied wherever the
 *     gate runs.
 *   - In production, `isPlus` is always false. Production users see the
 *     paywall on every Plus-gated entry. They will continue to until IAP
 *     wires real entitlements through this hook.
 *
 * When IAP lands, the dev override stays as a local-test hatch; production
 * paths read RC's `customerInfo.entitlements.active['plus']` (or the
 * mirrored Supabase column) instead of always-false.
 */
export function usePlusStatus(): { isPlus: boolean; loading: boolean } {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__
  return { isPlus: isDev, loading: false }
}
