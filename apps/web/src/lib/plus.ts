/**
 * Web mirror of apps/mobile/src/hooks/usePlusStatus.ts.
 *
 * Same gating contract as mobile: in development, every user is treated as
 * Plus so the developer can exercise the gated surface (Insights, Recurring
 * detection, Ask Murmur, Export) without RC sandbox setup. In production,
 * `isPlus` is always false until IAP / RevenueCat receipts populate
 * `profile.plus_status`.
 *
 * The hook can be called from server components (returns the static value)
 * and from client components (no React state needed today).
 */
export function getPlusStatus(): { isPlus: boolean } {
  const isDev = process.env.NODE_ENV !== 'production'
  return { isPlus: isDev }
}
