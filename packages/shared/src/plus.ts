/**
 * Shared Plus-entitlement resolver.
 *
 * The single canonical "is this user Plus?" question, and the only
 * source: `profile.plus_status === 'active'`, populated today by a
 * manual Supabase update (early access — there is no purchase flow yet
 * on any platform) and, once IAP/Stripe ships, by a validated receipt
 * webhook. There are no per-platform dev hatches layered over this —
 * mobile's `__DEV__` override and the web server's `MURMUR_DEV_PLUS`/
 * non-production `NODE_ENV` overrides were both deleted (fix-plan 0.4 +
 * 3.1): every build, dev or production, reads the same column the same
 * way.
 *
 * Why a column and not three drifting implementations: until this
 * shipped, mobile / web client / web server each had their own
 * answer. A user could buy Plus on iOS (writes the receipt via
 * RC's iOS SDK to `profile.plus_status`), open the desktop app,
 * and still see the paywall — because the desktop never read the
 * column. One function, one source of truth.
 */

/** Pulls the entitlement read out of a profile shape so any caller
 *  (mobile hook, web server resolver, server-side script) reads it
 *  the same way. Structurally typed so we don't force a Profile
 *  import on every consumer. */
export function isPlusFromProfile(
  profile: { plus_status?: 'active' | 'lapsed' | 'free' | null } | null | undefined,
): boolean {
  return profile?.plus_status === 'active'
}
