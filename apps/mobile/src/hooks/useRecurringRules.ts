import { useEffect, useState, useCallback } from 'react'
import { getCalendars } from 'expo-localization'
import * as Crypto from 'expo-crypto'
import { supabase } from '../lib/supabase'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'
import { nextOccurrence as sharedNextOccurrence } from '@voice-expense/shared'

// ─── Period bounds ────────────────────────────────────────────────────────────

function getPeriodBounds(period: BudgetPeriod | undefined, now: Date): { start: Date; end: Date } {
  const start = new Date(now)
  const end = new Date(now)

  switch (period) {
    case 'weekly':
      const day = start.getDay()
      start.setDate(start.getDate() - day)
      end.setDate(start.getDate() + 6)
      break
    case 'biweekly':
      start.setDate(start.getDate() - 13)
      break
    case 'quarterly':
      const q = Math.floor(start.getMonth() / 3)
      start.setMonth(q * 3, 1)
      end.setMonth(q * 3 + 3, 0)
      break
    case 'yearly':
      start.setMonth(0, 1)
      end.setMonth(11, 31)
      break
    default: // monthly
      start.setDate(1)
      end.setMonth(end.getMonth() + 1, 0)
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

// ─── Next occurrence ──────────────────────────────────────────────────────────
//
// Delegates to the one recurrence engine (`packages/shared/src/domain/
// recurrence.ts`, fix-plan 1.5 / audit 03-F8, 04-F2, 04-F3, 04-F20,
// 06-F22, 07-F22) instead of mutating a `Date` with `setMonth`/
// `setFullYear`, which overflowed instead of clamping at month ends —
// a rule anchored on the 31st permanently drifted to the 3rd after the
// first February. This file used to be one of three byte-for-byte
// copies of that bug; it is now a thin adapter over the shared engine.

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

// ─── Upcoming amount for Safe to Spend ───────────────────────────────────────

export function computeUpcomingRecurring(
  rules: RecurringRule[],
  period: BudgetPeriod | undefined,
): number {
  const now = new Date()
  const { start, end } = getPeriodBounds(period, now)

  return rules
    // Upcoming *spend*: only debit rules belong here. Credit rules (salary,
    // pension) counted as spend would inflate the committed number by the
    // user's own income — visible from the first onboarding-created rule.
    .filter((r) => r.is_active && r.direction === 'debit')
    .reduce((sum, rule) => {
      const next = computeNextOccurrence(rule)
      if (!next) return sum
      if (next >= start && next <= end) return sum + rule.amount
      return sum
    }, 0)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecurringRules(userId: string | undefined) {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('recurring_rules')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setRules((data as RecurringRule[]) ?? [])
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
        starts_at: new Date().toISOString(),
        // NOT the `last_generated: now()` workaround 03-F32 describes —
        // the shared engine now correctly treats `starts_at` as the
        // first occurrence when `last_generated` is null (`nextOccurrence
        // (rule, null, tz) === starts_at`), so this line is no longer
        // covering for a semantic gap. It stays because this call site
        // is exclusively `acceptPattern` (above), which always carries a
        // real `template_txn_id` — an already-logged transaction. Setting
        // `last_generated: null` here would make `starts_at` (= now)
        // immediately due, and the very next catch-up run would generate
        // a *second* transaction for today on top of the one the pattern
        // was detected from — 03-F12's back-generated-duplicate hazard,
        // whose guard is a different, not-yet-landed item. Once that
        // guard exists, this can become `last_generated: null` and stop
        // silently skipping the cycle the rule was created in.
        last_generated: new Date().toISOString(),
        template_txn_id: params.template_txn_id ?? null,
        is_active: true,
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
    await supabase.from('recurring_rules').update(changes).eq('id', id)
    await fetch()
  }

  return { rules, loading, createRule, toggleRule, deleteRule, updateRule, refetch: fetch }
}
