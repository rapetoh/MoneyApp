/**
 * Shared Plus-entitlement resolver.
 *
 * The single canonical "is this user Plus?" question. Reads the
 * profile column populated by IAP / RevenueCat receipt validation
 * (or the manual Supabase update for early access). Per-platform
 * dev hatches layer over this — mobile checks `__DEV__`, the web
 * server checks `MURMUR_DEV_PLUS=1` / non-production NODE_ENV —
 * but the production read is always this function.
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
