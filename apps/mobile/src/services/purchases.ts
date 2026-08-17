// Murmur Plus purchases — RevenueCat on iOS (Aug 16, 2026 owner decision).
//
// The one module that talks to the store. Everything else (paywall,
// Settings, the Plus gate) reads `profiles.plus_status`, which only the
// server writes — from RevenueCat's subscriber record via the
// revenuecat-webhook Edge Function (store events) and plus-sync (called
// here right after a purchase / restore so the unlock is immediate rather
// than waiting on webhook delivery). Nothing in this file grants Plus:
// migration 031's trigger refuses a client that tries.
//
// Enablement is env-driven so the app is safe to build before the owner
// has created the RevenueCat project: without EXPO_PUBLIC_REVENUECAT_IOS_KEY
// (eas.json / .env) `purchasesEnabled` is false, the SDK is never
// configured, and the paywall shows the "Plus is in preview" state it has
// shown since audit fix-plan 3.1. The RevenueCat *public* iOS SDK key
// (`appl_…`) is the only key that ever ships in the app; the secret key
// lives in Supabase Edge Function secrets.
//
// App user id = the Supabase auth user id, set on configure/logIn. That is
// what lets the server map a store event back to a profile row
// (_shared/entitlement.ts `subscriberIdCandidates`).
import { Platform, Linking } from 'react-native'
import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  INTRO_ELIGIBILITY_STATUS,
  type PurchasesPackage,
  type PurchasesOffering,
} from 'react-native-purchases'
import {
  PLUS_ENTITLEMENT_ID,
  PLUS_MANAGE_URL_APPLE,
  PLUS_OFFERING_ID,
  PLUS_PRODUCTS,
  type PlusPlan,
} from '@voice-expense/shared'
import { supabase } from '../lib/supabase'

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? ''

/** True when this build can sell Plus. Android is deliberately not wired
 *  yet (v1 sells on iOS only; Google Play billing is a later phase). */
export const purchasesEnabled: boolean = Platform.OS === 'ios' && IOS_KEY.length > 0

let configuredFor: string | null = null

/** Idempotent. Call whenever the signed-in user is known; switching users
 *  re-identifies the SDK. No-op when purchases are disabled. */
export async function configurePurchases(userId: string): Promise<void> {
  if (!purchasesEnabled) return
  if (configuredFor === userId) return
  if (configuredFor === null) {
    if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG)
    Purchases.configure({ apiKey: IOS_KEY, appUserID: userId })
  } else {
    await Purchases.logIn(userId)
  }
  configuredFor = userId
}

export interface PlanOffer {
  plan: PlusPlan
  pkg: PurchasesPackage
  /** Store-localised price, e.g. "$29.99" / "29,99 €". */
  priceString: string
  /** Store-localised per-month equivalent for the yearly plan, e.g. "$2.50". */
  pricePerMonthString: string | null
  /** Free-trial length in days when the store offers one *and* this user
   *  is still eligible (Apple: one intro offer per subscription group).
   *  null → charge starts immediately; the paywall must say so. */
  trialDays: number | null
}

export interface PlusOffers {
  monthly: PlanOffer | null
  yearly: PlanOffer | null
}

function trialDaysOf(pkg: PurchasesPackage, eligible: boolean): number | null {
  const intro = pkg.product.introPrice
  if (!eligible || !intro || intro.price !== 0) return null
  const n = intro.periodNumberOfUnits * intro.cycles
  switch (intro.periodUnit) {
    case 'DAY':
      return n
    case 'WEEK':
      return n * 7
    case 'MONTH':
      return n * 30
    case 'YEAR':
      return n * 365
    default:
      return null
  }
}

function pickPackage(offering: PurchasesOffering, plan: PlusPlan): PurchasesPackage | null {
  const wantType = plan === 'yearly' ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY
  const wantId = PLUS_PRODUCTS[plan]
  return (
    offering.availablePackages.find((p) => p.product.identifier === wantId) ??
    offering.availablePackages.find((p) => p.packageType === wantType) ??
    null
  )
}

/** Fetch what the store will sell this user, with prices and trial
 *  eligibility resolved. Throws when the store is unreachable — the
 *  paywall shows a retry, never a fake price. */
export async function loadPlusOffers(): Promise<PlusOffers> {
  const offerings = await Purchases.getOfferings()
  const offering = offerings.all[PLUS_OFFERING_ID] ?? offerings.current
  if (!offering) return { monthly: null, yearly: null }

  const monthlyPkg = pickPackage(offering, 'monthly')
  const yearlyPkg = pickPackage(offering, 'yearly')
  const ids = [monthlyPkg, yearlyPkg]
    .filter((p): p is PurchasesPackage => !!p)
    .map((p) => p.product.identifier)
  let eligibility: Record<string, { status: INTRO_ELIGIBILITY_STATUS }> = {}
  try {
    eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids)
  } catch {
    // Unknown eligibility → show the trial only if the store offers one;
    // Apple's purchase sheet is the final authority either way.
    eligibility = {}
  }
  const eligible = (id: string) => {
    const s = eligibility[id]?.status
    return (
      s === undefined ||
      s === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE ||
      s === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_UNKNOWN
    )
  }
  const toOffer = (plan: PlusPlan, pkg: PurchasesPackage | null): PlanOffer | null =>
    pkg
      ? {
          plan,
          pkg,
          priceString: pkg.product.priceString,
          pricePerMonthString: pkg.product.pricePerMonthString ?? null,
          trialDays: trialDaysOf(pkg, eligible(pkg.product.identifier)),
        }
      : null
  return { monthly: toOffer('monthly', monthlyPkg), yearly: toOffer('yearly', yearlyPkg) }
}

export type PurchaseOutcome =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'pending' } // Ask-to-Buy / deferred — Apple will finish it later
  | { kind: 'error'; message: string }

/** Ask the server to re-read RevenueCat and write `profiles.plus_*` for
 *  the signed-in user. Returns whether Plus is active afterwards. Errors
 *  are swallowed into `false` — the webhook will land shortly anyway;
 *  callers refetch the profile regardless. */
export async function syncPlusEntitlement(): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('plus-sync', { method: 'POST' })
    if (error) return false
    const d = data as { wrote?: boolean; entitlement?: { plus_status?: string } } | null
    return d?.wrote === true && d.entitlement?.plus_status === 'active'
  } catch {
    return false
  }
}

function isCancelled(e: unknown): boolean {
  const err = e as { userCancelled?: boolean; code?: unknown }
  return (
    err?.userCancelled === true ||
    err?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  )
}

function isDeferred(e: unknown): boolean {
  const err = e as { code?: unknown }
  return err?.code === Purchases.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR
}

/** Run the App Store purchase sheet for a plan, then sync the entitlement. */
export async function purchasePlan(offer: PlanOffer): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(offer.pkg)
    const active = !!customerInfo.entitlements.active[PLUS_ENTITLEMENT_ID]
    await syncPlusEntitlement()
    return active ? { kind: 'purchased' } : { kind: 'pending' }
  } catch (e) {
    if (isCancelled(e)) return { kind: 'cancelled' }
    if (isDeferred(e)) return { kind: 'pending' }
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

export type RestoreOutcome =
  | { kind: 'restored' }
  | { kind: 'nothing' }
  | { kind: 'error'; message: string }

/** "Restore purchases" — required by App Store review (3.1.1) on any screen
 *  that shows subscription prices. */
export async function restorePlus(): Promise<RestoreOutcome> {
  try {
    const info = await Purchases.restorePurchases()
    const active = !!info.entitlements.active[PLUS_ENTITLEMENT_ID]
    await syncPlusEntitlement()
    return active ? { kind: 'restored' } : { kind: 'nothing' }
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Apple's manage-subscriptions sheet (cancel / change plan). Falls back
 *  to the web page when the native sheet is unavailable. */
export async function manageSubscription(): Promise<void> {
  if (purchasesEnabled) {
    try {
      await Purchases.showManageSubscriptions()
      return
    } catch {
      /* fall through */
    }
  }
  await Linking.openURL(PLUS_MANAGE_URL_APPLE)
}
