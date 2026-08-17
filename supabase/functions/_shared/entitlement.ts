// Plus entitlement resolver — RevenueCat subscriber record → the
// `profiles.plus_*` columns (migration 031).
//
// Pure: no Deno / Supabase imports, so it is unit-tested from the
// monorepo (packages/shared/src/domain/__tests__/entitlement.test.ts
// imports this file by relative path, the same way recurrence.vendored
// .test.ts covers _shared/recurrence.ts). Both Edge Functions that write
// the entitlement — revenuecat-webhook (store events) and plus-sync
// (called by the app after purchase / restore, and by web "Refresh") —
// go through `resolveEntitlement` and `subscriberIdCandidates`, so a
// webhook and a client-initiated sync can never disagree about what a
// given RevenueCat record means.
//
// Why "fetch the subscriber, then resolve" rather than "map the webhook
// event type to a status": RevenueCat's event vocabulary (INITIAL_PURCHASE,
// RENEWAL, CANCELLATION, UNCANCELLATION, EXPIRATION, BILLING_ISSUE,
// PRODUCT_CHANGE, TRANSFER, …) encodes *what just happened*; the profile
// needs *what is true now*. CANCELLATION, for instance, must keep Plus
// active until the paid period ends. The subscriber record already
// carries the answer, so every event — including ones added after this
// was written — is handled by re-reading it.

/** Subset of RevenueCat REST v1 `GET /subscribers/{app_user_id}` we read. */
export interface RcSubscription {
  expires_date: string | null
  purchase_date?: string | null
  period_type?: 'trial' | 'intro' | 'normal' | string | null
  store?: string | null
  is_sandbox?: boolean | null
  unsubscribe_detected_at?: string | null
  billing_issues_detected_at?: string | null
  grace_period_expires_date?: string | null
  refunded_at?: string | null
}

export interface RcEntitlement {
  expires_date: string | null
  grace_period_expires_date?: string | null
  product_identifier: string
  purchase_date?: string | null
}

export interface RcSubscriber {
  original_app_user_id?: string
  entitlements?: Record<string, RcEntitlement>
  subscriptions?: Record<string, RcSubscription>
  management_url?: string | null
}

export type PlusStatus = 'active' | 'lapsed' | 'free'
export type PlusPeriodType = 'trial' | 'intro' | 'normal'

/** Exactly the columns migration 031 owns, ready for `.update()`. */
export interface PlusEntitlementColumns {
  plus_status: PlusStatus
  plus_product_id: string | null
  plus_period_type: PlusPeriodType | null
  plus_expires_at: string | null
  plus_will_renew: boolean | null
  plus_store: string | null
  plus_is_sandbox: boolean | null
}

export const PLUS_ENTITLEMENT_ID = 'plus'

function isFuture(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t > now.getTime()
}

function normalisePeriod(p: string | null | undefined): PlusPeriodType | null {
  return p === 'trial' || p === 'intro' || p === 'normal' ? p : null
}

/** Latest subscription by expiry — used for the "lapsed" description when
 *  the entitlement itself is gone. */
function latestSubscription(
  subs: Record<string, RcSubscription> | undefined,
): { productId: string; sub: RcSubscription } | null {
  if (!subs) return null
  let best: { productId: string; sub: RcSubscription } | null = null
  for (const [productId, sub] of Object.entries(subs)) {
    const t = sub.expires_date ? Date.parse(sub.expires_date) : 0
    const bt = best?.sub.expires_date ? Date.parse(best.sub.expires_date) : -1
    if (!best || t > bt) best = { productId, sub }
  }
  return best
}

export function resolveEntitlement(
  subscriber: RcSubscriber,
  now: Date,
  entitlementId: string = PLUS_ENTITLEMENT_ID,
): PlusEntitlementColumns {
  const ent = subscriber.entitlements?.[entitlementId] ?? null
  const subs = subscriber.subscriptions ?? {}

  // A lifetime/non-expiring grant has expires_date null; a subscription
  // in Apple's billing-retry grace period keeps the entitlement alive
  // through grace_period_expires_date.
  const active =
    !!ent &&
    (ent.expires_date === null ||
      isFuture(ent.expires_date, now) ||
      isFuture(ent.grace_period_expires_date, now))

  if (active && ent) {
    const sub = subs[ent.product_identifier] ?? null
    return {
      plus_status: 'active',
      plus_product_id: ent.product_identifier,
      plus_period_type: normalisePeriod(sub?.period_type),
      plus_expires_at: ent.expires_date,
      // Mirrors the SDK's CustomerInfo.willRenew: false once the user
      // turned auto-renew off or the store reported a billing failure.
      plus_will_renew: sub ? !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at : null,
      plus_store: sub?.store ?? null,
      plus_is_sandbox: sub?.is_sandbox ?? null,
    }
  }

  const everSubscribed = !!ent || Object.keys(subs).length > 0
  if (!everSubscribed) {
    return {
      plus_status: 'free',
      plus_product_id: null,
      plus_period_type: null,
      plus_expires_at: null,
      plus_will_renew: null,
      plus_store: null,
      plus_is_sandbox: null,
    }
  }

  const last = ent
    ? { productId: ent.product_identifier, sub: subs[ent.product_identifier] ?? null }
    : latestSubscription(subs)
  return {
    plus_status: 'lapsed',
    plus_product_id: last?.productId ?? null,
    plus_period_type: normalisePeriod(last?.sub?.period_type),
    plus_expires_at: ent?.expires_date ?? last?.sub?.expires_date ?? null,
    plus_will_renew: false,
    plus_store: last?.sub?.store ?? null,
    plus_is_sandbox: last?.sub?.is_sandbox ?? null,
  }
}

// ── Webhook helpers ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Subset of a RevenueCat webhook `event` we read. */
export interface RcWebhookEvent {
  type?: string
  app_user_id?: string
  original_app_user_id?: string
  aliases?: string[]
  transferred_from?: string[]
  transferred_to?: string[]
  environment?: string
}

/** Every Supabase user id a webhook event can refer to. RevenueCat app
 *  user ids are set to the Supabase `auth.users.id` on login (see
 *  apps/mobile/src/services/purchases.ts); anything that is not a UUID is
 *  an anonymous `$RCAnonymousID:…` alias and cannot map to a profile.
 *  TRANSFER events name both sides so the losing account is re-read too. */
export function subscriberIdCandidates(event: RcWebhookEvent): string[] {
  const raw = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ]
  const out: string[] = []
  for (const id of raw) {
    if (typeof id === 'string' && UUID_RE.test(id) && !out.includes(id)) out.push(id)
  }
  return out
}

/** Constant-time string compare for the webhook's shared secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
