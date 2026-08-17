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

// ── Payments (Aug 16, 2026 owner decision) ─────────────────────────────────
//
// Murmur Plus is an iOS auto-renewable subscription sold through
// RevenueCat: monthly $3.99 / yearly $29.99, 7-day free trial on both.
// Prices and trial length are *never* hard-coded in the product — the
// paywall reads them from the store offering — so a change in App Store
// Connect / RevenueCat needs no app release. These identifiers are the
// contract between App Store Connect, RevenueCat and this codebase.

/** App Store Connect product identifiers (subscription group "Murmur Plus"). */
export const PLUS_PRODUCTS = {
  monthly: 'murmur_plus_monthly',
  yearly: 'murmur_plus_yearly',
} as const

/** RevenueCat entitlement id both products attach to. */
export const PLUS_ENTITLEMENT_ID = 'plus'

/** RevenueCat offering the paywall renders (`Purchases.getOfferings().current`). */
export const PLUS_OFFERING_ID = 'default'

/** Apple's subscription-management page — the only "manage" destination
 *  for an App Store subscription (cancel / change plan / see renewal). */
export const PLUS_MANAGE_URL_APPLE = 'https://apps.apple.com/account/subscriptions'

/** Legal pages required next to any subscription price (App Store 3.1.2). */
export const LEGAL_URLS = {
  terms: 'https://money-app-web-w6su.vercel.app/terms',
  privacy: 'https://money-app-web-w6su.vercel.app/privacy',
} as const

export type PlusPlan = 'monthly' | 'yearly'

export function planFromProductId(productId: string | null | undefined): PlusPlan | null {
  if (!productId) return null
  if (productId === PLUS_PRODUCTS.yearly || /year|annual/i.test(productId)) return 'yearly'
  if (productId === PLUS_PRODUCTS.monthly || /month/i.test(productId)) return 'monthly'
  return null
}

/** What Settings should say about the subscription — one structured
 *  answer both platforms render, derived only from the server-written
 *  `plus_*` columns. `endsAt` is ISO or null. */
export type PlusDescription =
  | { kind: 'free' }
  | { kind: 'lapsed'; plan: PlusPlan | null; endedAt: string | null }
  | {
      kind: 'trial'
      plan: PlusPlan | null
      endsAt: string | null
      willRenew: boolean
      storeBacked: boolean
    }
  | {
      kind: 'active'
      plan: PlusPlan | null
      endsAt: string | null
      willRenew: boolean
      storeBacked: boolean
    }

export function describePlus(
  profile:
    | {
        plus_status?: 'active' | 'lapsed' | 'free' | null
        plus_product_id?: string | null
        plus_period_type?: 'trial' | 'intro' | 'normal' | string | null
        plus_expires_at?: string | null
        plus_will_renew?: boolean | null
        plus_synced_at?: string | null
      }
    | null
    | undefined,
): PlusDescription {
  if (!profile) return { kind: 'free' }
  const plan = planFromProductId(profile.plus_product_id)
  if (profile.plus_status === 'active') {
    // `plus_will_renew` is null when the store record carried no
    // subscription detail (e.g. an entitlement granted by hand); treat
    // "unknown" as renewing so we never wrongly announce an end date.
    const willRenew = profile.plus_will_renew !== false
    // `plus_synced_at` is set only by the server after reading a real
    // store record (plus-sync / revenuecat-webhook). An `active` without
    // it is a hand-granted entitlement (early access, test accounts):
    // Plus features are unlocked, but there is no App Store subscription
    // to "manage" — the paywall must still offer the plans, and Settings
    // must route to the paywall, not to Apple's (empty) manage sheet.
    const storeBacked = !!profile.plus_synced_at
    if (profile.plus_period_type === 'trial') {
      return {
        kind: 'trial',
        plan,
        endsAt: profile.plus_expires_at ?? null,
        willRenew,
        storeBacked,
      }
    }
    return { kind: 'active', plan, endsAt: profile.plus_expires_at ?? null, willRenew, storeBacked }
  }
  if (profile.plus_status === 'lapsed') {
    return { kind: 'lapsed', plan, endedAt: profile.plus_expires_at ?? null }
  }
  return { kind: 'free' }
}
