import { useEffect, useState, useCallback } from 'react'
import { getCalendars } from 'expo-localization'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { getCurrentProfileCurrency } from '../services/profileCurrency'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'
import {
  nextOccurrence as sharedNextOccurrence,
  periodBounds,
  monthBounds,
  monthIso,
  localParts,
  recurringOutflowInWindow,
  snapshotFx,
} from '@voice-expense/shared'

// ─── Next occurrence ──────────────────────────────────────────────────────────
//
// Delegates to the one recurrence engine (`packages/shared/src/domain/
// recurrence.ts`, fix-plan 1.5 / audit 03-F8, 04-F2, 04-F3, 04-F20,
// 06-F22, 07-F22) instead of mutating a `Date` with `setMonth`/
// `setFullYear`, which overflowed instead of clamping at month ends —
// a rule anchored on the 31st permanently drifted to the 3rd after the
// first February. This file used to be one of three byte-for-byte
// copies of that bug; it is now a thin adapter over the shared engine.
//
// `getPeriodBounds` (the fourth hand-rolled window regime the audit
// found — `biweekly` ended *today*, so nothing future was ever
// in-window, and `weekly` could span 38 days across a month boundary,
// fix-plan 2.1) is deleted outright in favour of `periodBounds` below.

/** Best-effort device zone for the many existing call sites
 *  (`recurringCatchUp.ts`, `app/recurring.tsx`, `app/transaction/
 *  [id].tsx`, `app/(tabs)/{index,budgets}.tsx`) that predate the shared
 *  engine and call `computeNextOccurrence`/`computeUpcomingRecurring`
 *  with no zone — threading `profile.timezone` through every one of
 *  them is fix-plan Stage 2 (this item's adoption is scoped to this
 *  hook and its own two writers: `createRule`/detected-pattern accept).
 *  Until then this preserves those call sites' previous behaviour
 *  (device-local time, the same zone `Date`'s local mutators implicitly
 *  used) while giving them the day-of-month clamp fix, which does not
 *  need the *correct* zone to be correct — only *a* zone, consistently
 *  applied. Mirrors `useProfile.ts`'s `captureDeviceTimezone` source. */
function deviceTimeZone(): string {
  try {
    return getCalendars()[0]?.timeZone ?? 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * The occurrence following `fromDate` (or, when omitted, the occurrence
 * following the rule's own `last_generated` — `starts_at` itself when
 * that is `null`, per 03-F32; every rule-creation path in the repo
 * today always sets `last_generated` at creation, so that branch is
 * latent, not yet observable, exactly as the audit found it). Pass an
 * explicit `tz` at any call site that has the user's `profile.timezone`
 * available; callers that don't fall back to the device zone.
 */
export function computeNextOccurrence(
  rule: RecurringRule,
  fromDate?: Date,
  tz: string = deviceTimeZone(),
): Date | null {
  const after = fromDate ? fromDate.toISOString() : (rule.last_generated ?? null)
  const occurrence = sharedNextOccurrence(rule, after, tz)
  return occurrence ? new Date(occurrence.instant) : null
}

/**
 * True when the rule's mechanically-next occurrence (from its own
 * `last_generated`/`starts_at`, *not* fast-forwarded to "now") already
 * fell in the past — i.e. generation hasn't caught up yet. Display
 * surfaces (fix-plan 2.1) use this to render an explicit "Overdue —
 * pending generation" state instead of sorting a stale past date as
 * the next imminent charge.
 */
export function isRuleOverdue(rule: RecurringRule, tz: string = deviceTimeZone()): boolean {
  const strictNext = computeNextOccurrence(rule, undefined, tz)
  return strictNext != null && strictNext.getTime() < Date.now()
}

// ─── Upcoming amount for Safe to Spend ───────────────────────────────────────

/**
 * Debit-only, FX-normalised, every-occurrence recurring spend in the
 * budget `period` containing "now" — the shared-engine replacement for
 * the four defects `computeUpcomingRecurring` had (fix-plan 2.1's "Why
 * now"): it summed raw `rule.amount` across currencies, counted only
 * the *next* occurrence (so a weekly rule contributed 1/4 of what it
 * should), and its own hand-rolled window regime had a `biweekly`
 * branch that ended *today* (nothing future was ever in-window) and a
 * `weekly` branch that could span 38 days across a month boundary.
 *
 * `anchorInstant` fixes a `biweekly` period's phase (`budgets.starts_at`
 * — `packages/shared/src/utils/period.ts`'s `periodBounds` throws
 * without one). Neither current caller (`app/(tabs)/index.tsx`,
 * `app/(tabs)/budgets.tsx`) threads the active budget's `starts_at`
 * through yet — that's those screens' own Stage 2 adoption, outside
 * this hook's file ownership — so a missing anchor for a biweekly
 * budget falls back to the calendar month rather than throwing on
 * every Home/Budgets render.
 */
export function computeUpcomingRecurring(
  rules: RecurringRule[],
  period: BudgetPeriod | undefined,
  opts: { anchorInstant?: string; tz?: string } = {},
): number {
  const tz = opts.tz ?? deviceTimeZone()
  const now = new Date().toISOString()
  let bounds
  try {
    bounds = periodBounds(period ?? 'monthly', now, tz, opts.anchorInstant)
  } catch {
    bounds = monthBounds(monthIso(now, tz), tz)
  }
  const { total } = recurringOutflowInWindow(rules, bounds.start, bounds.endExclusive, tz)
  return total
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecurringRules(userId: string | undefined) {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family): this fetch
  // used to discard `error` entirely, so a failed read rendered exactly
  // like "no recurring rules yet" everywhere this hook is consumed. The
  // prior `rules` are left in place on a failed read rather than cleared,
  // and `error` is exposed so a caller can render a real error state with
  // retry instead of the false empty one.
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data, error: fetchError } = await supabase
      .from('recurring_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setRules((data as RecurringRule[]) ?? [])
      setError(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  async function createRule(params: {
    name: string | null
    amount: number
    currency_code: string
    category_id: string | null
    direction: 'debit' | 'credit'
    payment_method: string | null
    note: string | null
    frequency: RecurringFrequency
    template_txn_id?: string | null
  }): Promise<RecurringRule | null> {
    if (!userId) return null

    // Anchor + FX snapshot (fix-plan 2.3(b) / 2.1). When this rule
    // templates an existing transaction (the only caller today,
    // `acceptPattern`, always passes one — a pattern candidate's
    // `templateTxnId` is its *newest* occurrence, i.e. `lastSeenAt`),
    // anchor `starts_at`/`last_generated` to that transaction's own
    // date instead of "now": generating from "now" onward is what let
    // an accepted candidate spanning Jun-Aug back-generate a duplicate
    // for a month the user had already logged manually. Reusing the
    // template's own FX snapshot (rather than a fresh lookup) is exact
    // — same amount, same currency, same day — and avoids a second
    // network round-trip.
    let anchorInstant = new Date().toISOString()
    let fxSnapshot: {
      amount_in_profile_currency: number | null
      fx_rate_to_profile: number | null
      fx_rate_date: string | null
    } = { amount_in_profile_currency: null, fx_rate_to_profile: null, fx_rate_date: null }

    if (params.template_txn_id) {
      const { data: template } = await supabase
        .from('transactions')
        .select('transacted_at, amount_in_profile_currency, fx_rate_to_profile, fx_rate_date')
        .eq('id', params.template_txn_id)
        .maybeSingle()
      if (template?.transacted_at) {
        anchorInstant = template.transacted_at
        fxSnapshot = {
          amount_in_profile_currency: template.amount_in_profile_currency ?? null,
          fx_rate_to_profile: template.fx_rate_to_profile ?? null,
          fx_rate_date: template.fx_rate_date ?? null,
        }
      }
    }
    if (fxSnapshot.amount_in_profile_currency == null) {
      // No template (or its snapshot hasn't landed yet) — fresh lookup
      // against the profile's own currency, same as every other
      // write-time snapshot in the app (migration 011).
      const profileCurrency = getCurrentProfileCurrency()
      const tz = deviceTimeZone()
      const fx = await snapshotFx(anchorInstant, params.currency_code, profileCurrency, params.amount, tz)
      if (fx) fxSnapshot = fx
    }
    const anchorParts = localParts(anchorInstant, deviceTimeZone())

    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        client_id: Crypto.randomUUID(),
        name: params.name,
        amount: params.amount,
        currency_code: params.currency_code,
        category_id: params.category_id,
        direction: params.direction,
        payment_method: params.payment_method,
        note: params.note,
        frequency: params.frequency,
        interval: 1,
        starts_at: anchorInstant,
        // NOT the `last_generated: now()` workaround 03-F32 describes —
        // the shared engine correctly treats `starts_at` as the first
        // occurrence when `last_generated` is null (`nextOccurrence
        // (rule, null, tz) === starts_at`). Anchoring both to the
        // template's own date (or "now" when there is none) means the
        // generators produce the *next* occurrence after whatever was
        // already observed, never a back-dated duplicate of it.
        last_generated: anchorInstant,
        template_txn_id: params.template_txn_id ?? null,
        is_active: true,
        amount_in_profile_currency: fxSnapshot.amount_in_profile_currency,
        fx_rate_to_profile: fxSnapshot.fx_rate_to_profile,
        fx_rate_date: fxSnapshot.fx_rate_date,
        anchor_day: anchorParts.d,
        anchor_weekday: anchorParts.weekdayIndex + 1,
        anchor_time: `${String(anchorParts.hour).padStart(2, '0')}:${String(anchorParts.minute).padStart(2, '0')}:${String(anchorParts.second).padStart(2, '0')}`,
      })
      .select()
      .single()

    if (error) {
      // One active rule per (user, direction, name) is enforced by
      // idx_recurring_rules_active_name — a same-merchant create (e.g.
      // accepting a price-changed pattern) merges into the existing rule
      // instead of failing silently.
      if (error.code === '23505' && params.name) {
        const { data: existing } = await supabase
          .from('recurring_rules')
          .select('*')
          .eq('user_id', userId)
          .eq('direction', params.direction)
          .eq('is_active', true)
          .ilike('name', params.name)
          .limit(1)
          .maybeSingle()
        if (existing) {
          await supabase
            .from('recurring_rules')
            .update({
              amount: params.amount,
              frequency: params.frequency,
              category_id: params.category_id,
              payment_method: params.payment_method,
              // Re-snapshotted on update (fix-plan 2.1's "snapshotted on
              // create/update") — the merged-in amount is the price
              // change itself, so the old rate no longer applies.
              amount_in_profile_currency: fxSnapshot.amount_in_profile_currency,
              fx_rate_to_profile: fxSnapshot.fx_rate_to_profile,
              fx_rate_date: fxSnapshot.fx_rate_date,
            })
            .eq('id', existing.id)
          await fetch()
          return {
            ...(existing as RecurringRule),
            amount: params.amount,
            frequency: params.frequency,
          }
        }
      }
      console.warn('[useRecurringRules] createRule failed:', error)
      return null
    }
    await fetch()
    return data as RecurringRule
  }

  async function toggleRule(id: string, isActive: boolean) {
    await supabase.from('recurring_rules').update({ is_active: isActive }).eq('id', id)
    await fetch()
  }

  async function deleteRule(id: string) {
    await supabase.from('recurring_rules').delete().eq('id', id)
    await fetch()
  }

  async function updateRule(
    id: string,
    changes: Partial<
      Pick<
        RecurringRule,
        | 'frequency'
        | 'amount'
        | 'name'
        | 'ends_at'
        | 'category_id'
        | 'direction'
        | 'payment_method'
        | 'note'
      >
    >,
  ) {
    let payload: typeof changes & {
      amount_in_profile_currency?: number | null
    } = changes
    // Amount changed: re-derive the FX snapshot in place from the rule's
    // own already-known rate (mirrors `updateAmountSnapshot` in
    // `apps/mobile/src/services/sync/transactionStore.ts` for a
    // transaction's amount edit) rather than a fresh network lookup —
    // fix-plan 2.1's "snapshotted on create/update".
    if (changes.amount != null) {
      const current = rules.find((r) => r.id === id)
      if (current?.fx_rate_to_profile != null) {
        payload = {
          ...changes,
          amount_in_profile_currency: Math.round(changes.amount * current.fx_rate_to_profile * 100) / 100,
        }
      }
    }
    await supabase.from('recurring_rules').update(payload).eq('id', id)
    await fetch()
  }

  return { rules, loading, error, createRule, toggleRule, deleteRule, updateRule, refetch: fetch }
}
