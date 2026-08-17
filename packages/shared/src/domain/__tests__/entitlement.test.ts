/**
 * Plus entitlement — server resolver + client description.
 *
 * `supabase/functions/_shared/entitlement.ts` is pure TypeScript with no
 * Deno imports precisely so it can be exercised here (same pattern as
 * recurrence.vendored.test.ts). These cases are the contract every
 * RevenueCat webhook event and every post-purchase sync is judged by.
 */
import { describe, expect, it } from 'vitest'
import {
  resolveEntitlement,
  subscriberIdCandidates,
  safeEqual,
  type RcSubscriber,
} from '../../../../../supabase/functions/_shared/entitlement'
import { describePlus, planFromProductId, PLUS_PRODUCTS } from '../../plus'

const NOW = new Date('2026-08-16T20:00:00Z')
const FUTURE = '2026-08-23T20:00:00Z'
const PAST = '2026-08-01T20:00:00Z'

function subscriber(
  ent: Partial<RcSubscriber['entitlements']> | null,
  subs: RcSubscriber['subscriptions'] = {},
): RcSubscriber {
  return { entitlements: ent ? (ent as RcSubscriber['entitlements']) : {}, subscriptions: subs }
}

describe('resolveEntitlement', () => {
  it('never subscribed → free, every descriptor null', () => {
    expect(resolveEntitlement(subscriber(null), NOW)).toEqual({
      plus_status: 'free',
      plus_product_id: null,
      plus_period_type: null,
      plus_expires_at: null,
      plus_will_renew: null,
      plus_store: null,
      plus_is_sandbox: null,
    })
  })

  it('free trial in progress → active / trial / renews', () => {
    const r = resolveEntitlement(
      subscriber(
        { plus: { expires_date: FUTURE, product_identifier: PLUS_PRODUCTS.yearly } },
        {
          [PLUS_PRODUCTS.yearly]: {
            expires_date: FUTURE,
            period_type: 'trial',
            store: 'app_store',
            is_sandbox: true,
            unsubscribe_detected_at: null,
            billing_issues_detected_at: null,
          },
        },
      ),
      NOW,
    )
    expect(r).toEqual({
      plus_status: 'active',
      plus_product_id: PLUS_PRODUCTS.yearly,
      plus_period_type: 'trial',
      plus_expires_at: FUTURE,
      plus_will_renew: true,
      plus_store: 'app_store',
      plus_is_sandbox: true,
    })
  })

  it('CANCELLATION mid-period → still active until expiry, will_renew false', () => {
    const r = resolveEntitlement(
      subscriber(
        { plus: { expires_date: FUTURE, product_identifier: PLUS_PRODUCTS.monthly } },
        {
          [PLUS_PRODUCTS.monthly]: {
            expires_date: FUTURE,
            period_type: 'normal',
            store: 'app_store',
            unsubscribe_detected_at: '2026-08-15T00:00:00Z',
          },
        },
      ),
      NOW,
    )
    expect(r.plus_status).toBe('active')
    expect(r.plus_will_renew).toBe(false)
  })

  it('billing issue inside the grace period keeps Plus on; will_renew false', () => {
    const r = resolveEntitlement(
      subscriber(
        {
          plus: {
            expires_date: PAST,
            grace_period_expires_date: FUTURE,
            product_identifier: PLUS_PRODUCTS.monthly,
          },
        },
        {
          [PLUS_PRODUCTS.monthly]: {
            expires_date: PAST,
            grace_period_expires_date: FUTURE,
            period_type: 'normal',
            billing_issues_detected_at: '2026-08-02T00:00:00Z',
          },
        },
      ),
      NOW,
    )
    expect(r.plus_status).toBe('active')
    expect(r.plus_will_renew).toBe(false)
  })

  it('EXPIRATION → lapsed, keeps the last product + end date for Settings', () => {
    const r = resolveEntitlement(
      subscriber(
        { plus: { expires_date: PAST, product_identifier: PLUS_PRODUCTS.yearly } },
        {
          [PLUS_PRODUCTS.yearly]: { expires_date: PAST, period_type: 'normal', store: 'app_store' },
        },
      ),
      NOW,
    )
    expect(r).toMatchObject({
      plus_status: 'lapsed',
      plus_product_id: PLUS_PRODUCTS.yearly,
      plus_expires_at: PAST,
      plus_will_renew: false,
      plus_store: 'app_store',
    })
  })

  it('entitlement gone but a subscription existed → lapsed from the latest subscription', () => {
    const r = resolveEntitlement(
      subscriber(null, {
        [PLUS_PRODUCTS.monthly]: { expires_date: '2026-05-01T00:00:00Z', period_type: 'normal' },
        [PLUS_PRODUCTS.yearly]: { expires_date: PAST, period_type: 'normal' },
      }),
      NOW,
    )
    expect(r.plus_status).toBe('lapsed')
    expect(r.plus_product_id).toBe(PLUS_PRODUCTS.yearly)
    expect(r.plus_expires_at).toBe(PAST)
  })

  it('non-expiring grant (expires_date null) is active with unknown renewal', () => {
    const r = resolveEntitlement(
      subscriber({ plus: { expires_date: null, product_identifier: 'murmur_plus_lifetime' } }),
      NOW,
    )
    expect(r.plus_status).toBe('active')
    expect(r.plus_will_renew).toBeNull()
  })

  it('an unrelated entitlement id does not unlock Plus', () => {
    const r = resolveEntitlement(
      subscriber({ other: { expires_date: FUTURE, product_identifier: 'x' } }),
      NOW,
    )
    // Has history (an entitlement exists) but never Plus → lapsed is
    // wrong here; there was no Plus subscription at all.
    expect(r.plus_status).toBe('free')
  })
})

describe('subscriberIdCandidates', () => {
  const uid = '0b0f0d3e-6d5c-4b8a-9f2e-1c2d3e4f5a6b'
  const uid2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
  it('keeps only UUID app user ids, deduplicated, in order', () => {
    expect(
      subscriberIdCandidates({
        app_user_id: '$RCAnonymousID:abc',
        original_app_user_id: uid,
        aliases: ['$RCAnonymousID:abc', uid, uid2],
      }),
    ).toEqual([uid, uid2])
  })
  it('includes both sides of a TRANSFER', () => {
    expect(
      subscriberIdCandidates({ type: 'TRANSFER', transferred_from: [uid], transferred_to: [uid2] }),
    ).toEqual([uid, uid2])
  })
  it('anonymous-only event → nothing to sync', () => {
    expect(subscriberIdCandidates({ app_user_id: '$RCAnonymousID:abc' })).toEqual([])
  })
})

describe('safeEqual', () => {
  it('compares exactly', () => {
    expect(safeEqual('secret', 'secret')).toBe(true)
    expect(safeEqual('secret', 'secreT')).toBe(false)
    expect(safeEqual('secret', 'secret ')).toBe(false)
  })
})

describe('describePlus / planFromProductId', () => {
  it('maps product ids to plans', () => {
    expect(planFromProductId(PLUS_PRODUCTS.monthly)).toBe('monthly')
    expect(planFromProductId(PLUS_PRODUCTS.yearly)).toBe('yearly')
    expect(planFromProductId(null)).toBeNull()
  })
  it('free / trial / active / lapsed', () => {
    expect(describePlus(null)).toEqual({ kind: 'free' })
    expect(describePlus({ plus_status: null })).toEqual({ kind: 'free' })
    expect(
      describePlus({
        plus_status: 'active',
        plus_product_id: PLUS_PRODUCTS.yearly,
        plus_period_type: 'trial',
        plus_expires_at: FUTURE,
        plus_will_renew: true,
      }),
    ).toEqual({
      kind: 'trial',
      plan: 'yearly',
      endsAt: FUTURE,
      willRenew: true,
      storeBacked: false,
    })
    expect(
      describePlus({
        plus_status: 'active',
        plus_product_id: PLUS_PRODUCTS.monthly,
        plus_period_type: 'normal',
        plus_expires_at: FUTURE,
        plus_will_renew: false,
      }),
    ).toEqual({
      kind: 'active',
      plan: 'monthly',
      endsAt: FUTURE,
      willRenew: false,
      storeBacked: false,
    })
    expect(
      describePlus({
        plus_status: 'lapsed',
        plus_product_id: PLUS_PRODUCTS.yearly,
        plus_expires_at: PAST,
      }),
    ).toEqual({ kind: 'lapsed', plan: 'yearly', endedAt: PAST })
  })
  it('a hand-granted active (no store detail) reads as active + renewing, never as ending, and is not store-backed', () => {
    expect(describePlus({ plus_status: 'active' })).toEqual({
      kind: 'active',
      plan: null,
      endsAt: null,
      willRenew: true,
      storeBacked: false,
    })
  })
  it('a server-synced active is store-backed (Manage on Apple offered; paywall shows already-subscribed)', () => {
    const d = describePlus({
      plus_status: 'active',
      plus_product_id: PLUS_PRODUCTS.yearly,
      plus_period_type: 'normal',
      plus_expires_at: FUTURE,
      plus_will_renew: true,
      plus_synced_at: '2026-08-16T20:00:00Z',
    })
    expect(d.kind === 'active' && d.storeBacked).toBe(true)
  })
})
