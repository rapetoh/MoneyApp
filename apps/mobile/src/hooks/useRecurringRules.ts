import { useEffect, useState, useCallback } from 'react'
import { getCalendars } from 'expo-localization'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import { useCachedState } from '../services/queryCache'
import { getCurrentProfileCurrency } from '../services/profileCurrency'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'
import {
  nextOccurrence as sharedNextOccurrence,
  buildRuleAnchor,
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

// `computeUpcomingRecurring` (debit-only, FX-normalised, every-occurrence
// recurring spend in a budget period) lived here until fix-plan 4.3: its
// last two callers (`app/(tabs)/index.tsx`, `app/(tabs)/budgets.tsx`)
// migrated to the single `budgetStatusFor` computation in fix-plan 2.5,
// which folds the same recurring-outflow figure into one status object
// alongside actual spend — see the "The one budget-status computation"
// comment at each call site. Deleted rather than kept as an unused
// export so the next reader cannot wire up the old formula by mistake.

// ─── Hook ─────────────────────────────────────────────────────────────────────

const EMPTY_RULES: RecurringRule[] = []

export function useRecurringRules(userId: string | undefined) {
  // Shared, process-lifetime value (src/services/queryCache.ts) — see
  // useCategories for why every data hook reads through it.
  const [rules, setRules, hasCached] = useCachedState<RecurringRule[]>(
    userId ? `recurring_rules:${userId}` : null,
    EMPTY_RULES,
  )
  const [loading, setLoading] = useState(!hasCached)
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
      // Soft-deleted rules (fix-plan 3.3 — `deleteRule` below no longer
      // hard-deletes the row) must not resurrect in the list they were
      // just removed from. `is_deleted` has carried this contract since
      // migration 018 gave every synced entity the same shape as
      // `transactions`; this read simply never honoured it.
      .eq('is_deleted', false)
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
    /** Optional — the "Add manually" form (fix-plan 3.3) has no payment-
     *  method/note fields (they describe *how a transaction was paid*,
     *  meaningless before any occurrence exists yet); defaults to null. */
    payment_method?: string | null
    note?: string | null
    frequency: RecurringFrequency
    template_txn_id?: string | null
    /** Cadence multiplier — "every N {frequency}". Defaults to 1. */
    interval?: number
    /** Explicit first-occurrence instant for a rule created with no
     *  template transaction (fix-plan 3.3's "Add manually" form's own
     *  "next date" field). Ignored when `template_txn_id` is set — the
     *  template's own `transacted_at` is authoritative there, exactly as
     *  before. Defaults to "now" when neither is given. */
    starts_at?: string
    /** "Cancel from" — the rule stops generating occurrences at/after
     *  this instant. Null (the default) means no end. */
    ends_at?: string | null
  }): Promise<RecurringRule | null> {
    if (!userId) return null

    // Anchor + FX snapshot (fix-plan 2.3(b) / 2.1). When this rule
    // templates an existing transaction (e.g. `acceptPattern` — a
    // pattern candidate's `templateTxnId` is its *newest* occurrence,
    // i.e. `lastSeenAt`), anchor `starts_at`/`last_generated` to that
    // transaction's own date instead of "now": generating from "now"
    // onward is what let an accepted candidate spanning Jun-Aug
    // back-generate a duplicate for a month the user had already logged
    // manually. Reusing the template's own FX snapshot (rather than a
    // fresh lookup) is exact — same amount, same currency, same day —
    // and avoids a second network round-trip. A rule created manually
    // (fix-plan 3.3, no template) anchors on the form's own "next date"
    // field instead, defaulting to "now" when that's also absent.
    let anchorInstant = params.starts_at ?? new Date().toISOString()
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
    // Shared anchor derivation (fix-plan 3.3's `buildRuleAnchor`) — this
    // used to hand-roll the same `localParts` + zero-padding triple that
    // web's `acceptCandidate` also hand-rolls; the manual-creation path
    // added here would have been a third copy.
    const anchor = buildRuleAnchor(anchorInstant, deviceTimeZone())

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
        interval: params.interval ?? 1,
        starts_at: anchor.starts_at,
        ends_at: params.ends_at ?? null,
        // NOT the `last_generated: now()` workaround 03-F32 describes —
        // the shared engine correctly treats `starts_at` as the first
        // occurrence when `last_generated` is null (`nextOccurrence
        // (rule, null, tz) === starts_at`). A template transaction IS an
        // already-observed occurrence, so `last_generated` anchors to it
        // too — the generators then produce the *next* occurrence after
        // it, never a back-dated duplicate of the row the user already
        // logged. A rule created manually with no template (fix-plan
        // 3.3's "Add manually") has observed nothing yet: leaving
        // `last_generated` null is what makes the form's own "next
        // date" the literal next occurrence rather than one cadence
        // step past it.
        last_generated: params.template_txn_id ? anchor.starts_at : null,
        template_txn_id: params.template_txn_id ?? null,
        is_active: true,
        amount_in_profile_currency: fxSnapshot.amount_in_profile_currency,
        fx_rate_to_profile: fxSnapshot.fx_rate_to_profile,
        fx_rate_date: fxSnapshot.fx_rate_date,
        anchor_day: anchor.anchor_day,
        anchor_weekday: anchor.anchor_weekday,
        anchor_time: anchor.anchor_time,
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
              interval: params.interval ?? 1,
              ends_at: params.ends_at ?? null,
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

  /**
   * Soft delete (fix-plan 3.3 — the plan's explicit "delete (soft)"
   * requirement). The old hard `.delete()` bypassed the `is_deleted`
   * contract every other synced entity carries since migration 018 (the
   * generic sync store's `softDelete`, `versionGuardedDelete`) — a rule
   * deleted here left no trace for a future audit/undo and, had mobile's
   * offline outbox for `recurring_rule` ever been adopted (it is wired
   * in `entityRegistry.ts` but this hook still writes online-only), a
   * hard delete would have raced a concurrent update instead of losing
   * to a version guard.
   */
  async function deleteRule(id: string) {
    const current = rules.find((r) => r.id === id)
    await supabase
      .from('recurring_rules')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), version: (current?.version ?? 1) + 1 })
      .eq('id', id)
    await fetch()
  }

  async function updateRule(
    id: string,
    changes: Partial<
      Pick<
        RecurringRule,
        | 'frequency'
        | 'interval'
        | 'amount'
        | 'currency_code'
        | 'name'
        | 'starts_at'
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
      fx_rate_to_profile?: number | null
      fx_rate_date?: string | null
      last_generated?: string | null
      anchor_day?: number | null
      anchor_weekday?: number | null
      anchor_time?: string | null
    } = changes
    const current = rules.find((r) => r.id === id)

    // "Next charge" edited (fix-plan 3.3's edit form). `nextOccurrence`
    // computes forward from `last_generated`, not from `starts_at`, once
    // a rule has one (every rule does after its first generation/
    // creation) — so changing `starts_at` alone would silently do
    // nothing to the displayed/generated next date. Re-anchoring
    // `last_generated` to null puts the rule back in the same "nothing
    // observed yet, starts_at is the pending first occurrence" state a
    // freshly-created manual rule starts in (see `createRule` above),
    // which is what makes the new date the literal next occurrence
    // rather than one cadence step past it. The anchor triple moves
    // with it so the day-of-month clamp matches the new date, not the
    // old one.
    if (changes.starts_at != null) {
      const anchor = buildRuleAnchor(changes.starts_at, deviceTimeZone())
      payload = {
        ...payload,
        starts_at: anchor.starts_at,
        last_generated: null,
        anchor_day: anchor.anchor_day,
        anchor_weekday: anchor.anchor_weekday,
        anchor_time: anchor.anchor_time,
      }
    }

    // Amount or currency changed: re-derive the FX snapshot. An amount-only
    // change re-derives in place from the rule's own already-known rate
    // (mirrors `updateAmountSnapshot` in `apps/mobile/src/services/sync/
    // transactionStore.ts` for a transaction's amount edit); a currency
    // change needs a fresh network lookup — the old rate was to a
    // different quote currency entirely (fix-plan 2.1's "snapshotted on
    // create/update").
    if (changes.currency_code != null && changes.currency_code !== current?.currency_code) {
      const profileCurrency = getCurrentProfileCurrency()
      const amount = changes.amount ?? current?.amount ?? 0
      const fx = await snapshotFx(
        current?.starts_at ?? new Date().toISOString(),
        changes.currency_code,
        profileCurrency,
        amount,
        deviceTimeZone(),
      )
      if (fx) payload = { ...payload, ...fx }
    } else if (changes.amount != null && current?.fx_rate_to_profile != null) {
      payload = {
        ...payload,
        amount_in_profile_currency: Math.round(changes.amount * current.fx_rate_to_profile * 100) / 100,
      }
    }
    // Surfaced return (fix-plan 2.13's pattern, extended here) — this
    // used to discard the write outcome entirely, so the "Edit recurring
    // rule" sheet (fix-plan 3.3) could not tell a caller a save had
    // failed and would close as if it had succeeded.
    const { error } = await supabase.from('recurring_rules').update(payload).eq('id', id)
    await fetch()
    return !error
  }

  return { rules, loading, error, createRule, toggleRule, deleteRule, updateRule, refetch: fetch }
}
