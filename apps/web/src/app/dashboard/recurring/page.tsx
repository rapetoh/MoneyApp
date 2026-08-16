'use client'
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Money } from '../../../components/Money'
import { MerchantLogo } from '../../../components/MerchantLogo'
import { Icon } from '../../../components/Icons'
import { ErrorState } from '../../../components/ErrorState'
import {
  detectRecurringPatterns,
  type RecurringPatternCandidate,
} from '../../../lib/recurringPatternDetector'
import { usePlus } from '../../../lib/plus'
import { useRealtime } from '../../../lib/useRealtime'
import { RecurringRuleModal, type RecurringRuleFormValues } from '../../../components/RecurringRuleModal'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'
import {
  nextOccurrence as sharedNextOccurrence,
  monthlyEquivalent,
  annualEquivalent,
  chargesInWindow,
  localDay,
  localParts,
  daysBetween,
  addDays,
  civilDateTimeToInstant,
  snapshotFx,
} from '@voice-expense/shared'

type Txn = {
  id: string
  amount: number
  amount_in_profile_currency: number | null
  fx_rate_to_profile: number | null
  fx_rate_date: string | null
  currency_code: string
  direction: 'debit' | 'credit'
  merchant: string | null
  category_id: string | null
  payment_method: string | null
  transacted_at: string
  is_deleted: boolean
  is_recurring: boolean
}

/** FX-aware amount for a rule's own cost normalizers (fix-plan 2.1): use
 *  the profile-currency snapshot (migration 025) when it has landed,
 *  never null-coalesce a pending one to 0 — a EUR rule and a USD rule
 *  on a USD profile must not sum as if both were already dollars. */
function fxAmount(r: RecurringRule): number {
  return r.amount_in_profile_currency ?? r.amount
}
type Cat = { id: string; name: string; color?: string | null }

function freqLabel(f: RecurringFrequency): string {
  return (
    {
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Bi-weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
    }[f] ?? f
  )
}

// Thin adapter over the one recurrence engine (`packages/shared/src/
// domain/recurrence.ts`, fix-plan 1.5 / audit 03-F8, 04-F2, 04-F3,
// 04-F20, 06-F22, 07-F22). This used to be the third byte-for-byte copy
// of a `setMonth`/`setFullYear` overflow bug — a rule anchored on the
// 31st permanently drifted to the 3rd after the first February. `tz` is
// `profile.timezone` (fix-plan 2.4), not the browser's own zone.
function nextOccurrence(rule: RecurringRule, tz: string, fromDate?: Date): Date | null {
  const after = fromDate ? fromDate.toISOString() : (rule.last_generated ?? null)
  const occurrence = sharedNextOccurrence(rule, after, tz)
  return occurrence ? new Date(occurrence.instant) : null
}

// Pre-namespacing key: every account on a shared browser profile read and
// wrote the same bucket, so account A's dismissals hid account B's real
// candidates. Kept only so `readDismissed` can clear it out below — never
// read from again, and unattributable to any one user so it cannot be
// migrated.
const LEGACY_DISMISS_KEY = 'murmur_recurring_dismissed_v1'

function dismissKey(userId: string): string {
  return `murmur_recurring_dismissed_v1:${userId}`
}

function readDismissed(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    localStorage.removeItem(LEGACY_DISMISS_KEY)
    const raw = localStorage.getItem(dismissKey(userId))
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function writeDismissed(userId: string, s: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(dismissKey(userId), JSON.stringify(Array.from(s).slice(-100)))
  } catch {
    // Ignore quota errors
  }
}

// `monthlyEquivalent`/`annualEquivalent` (cost normalizers, honouring
// `interval` — 03-F23) are imported directly from the shared module
// above; this file no longer carries its own copy.

// Every charge from each active rule in the next 30 days, resolved via
// the shared engine's `chargesInWindow` (fix-plan 2.3(c) — "both writers
// now call this one generator") instead of a hand-rolled `while (nxt &&
// nxt <= horizon && safety < 60)` loop. `day` is a 1..30 offset from
// today in `tz` — the grid this feeds (1..30 cells under a fixed
// weekday header) is fix-plan 2.4's own item; this function only owns
// the occurrence math that decides *which* day each charge lands on.
/** The calendar date `dayOffset` (1 = today, matching `chargesIn30Days`'s
 *  own convention) lands on, formatted for display. Noon avoids the
 *  midnight-boundary flip a bare `new Date(instant).toLocaleDateString()`
 *  can hit right at a DST transition. */
function dayOffsetToLabel(dayOffset: number, tz: string, locale: string): string {
  const todayIso = localDay(new Date().toISOString(), tz)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const target = addDays(ty, tm, td, dayOffset - 1)
  const instant = civilDateTimeToInstant(target.y, target.m, target.d, 12, 0, 0, tz)
  return new Date(instant).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

function chargesIn30Days(rules: RecurringRule[], tz: string): Array<{ day: number; rule: RecurringRule }> {
  const todayIso = localDay(new Date().toISOString(), tz)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const startInstant = civilDateTimeToInstant(ty, tm, td, 0, 0, 0, tz)
  const horizon = addDays(ty, tm, td, 30)
  const endExclusiveInstant = civilDateTimeToInstant(horizon.y, horizon.m, horizon.d, 0, 0, 0, tz)

  const active = rules.filter((r) => r.is_active)
  const out: Array<{ day: number; rule: RecurringRule }> = []
  for (const { rule, occurrence } of chargesInWindow(active, startInstant, endExclusiveInstant, tz)) {
    const occ = localParts(occurrence.instant, tz)
    const dayOffset = daysBetween(ty, tm, td, occ.y, occ.m, occ.d)
    out.push({ day: dayOffset + 1, rule })
  }
  return out
}

export default function RecurringPage() {
  const supabase = createClient()
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const { isPlus } = usePlus()
  const [loading, setLoading] = useState(true)
  // Read-error state, distinct from "loaded, no recurring rules yet"
  // (fix-plan 2.13 / audit 08-F21 family).
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string; timezone?: string } | null>(
    null,
  )
  const [userId, setUserId] = useState<string | null>(null)
  // profiles.timezone (fix-plan 1.3 part 1, written by `TimezoneSync` in
  // dashboard/layout.tsx on every authenticated render) — every window
  // this page computes (the 30-day strip below, each rule's next-charge
  // date) now resolves in the profile's own zone rather than the
  // browser's, so this page agrees with mobile and the Overview about
  // which day a charge lands on (fix-plan 2.4).
  const tz = profile?.timezone || 'UTC'

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    setDismissed(readDismissed(user.id))
    const [r, t, c, p] = await Promise.all([
      supabase
        .from('recurring_rules')
        .select('*')
        .eq('user_id', user.id)
        // Soft-deleted rules (fix-plan 3.3 — the new delete action below
        // soft-deletes, matching the `is_deleted` contract migration 018
        // gave this table) must not resurrect in the list they were just
        // removed from.
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('transacted_at', { ascending: false }),
      supabase
        .from('categories')
        .select('id, name, color')
        .eq('user_id', user.id)
        .eq('is_archived', false),
      supabase.from('profiles').select('currency_code, locale, timezone').eq('id', user.id).single(),
    ])
    const failure = r.error ?? t.error ?? c.error ?? p.error
    setLoadError(failure ? failure.message : null)
    if (!r.error) setRules((r.data ?? []) as RecurringRule[])
    if (!t.error) setTransactions((t.data ?? []) as Txn[])
    if (!c.error) setCategories((c.data ?? []) as Cat[])
    if (!p.error) setProfile(p.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Realtime — one shared hook per table, not a hand-rolled effect
  // (fix-plan 4.6). The previous version returned its
  // `channel.unsubscribe()` from *inside* the async IIFE; the `useEffect`
  // itself only ever returned `() => { active = false }`, so React never
  // called the real cleanup and every mount/unmount leaked a channel.
  // Without this subscription at all, the user accepting a "new pattern
  // detected" banner on mobile (or adding a rule from the edit screen
  // there) leaves the desktop Recurring page showing yesterday's list
  // until the user reloads.
  const realtimeFilter = userId ? `user_id=eq.${userId}` : null
  useRealtime('recurring_rules', realtimeFilter, load)
  useRealtime('transactions', realtimeFilter, load)

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const candidates = useMemo<RecurringPatternCandidate[]>(() => {
    if (!isPlus) return []
    return detectRecurringPatterns({
      transactions: transactions as any,
      existingRules: rules,
      dismissedKeys: dismissed,
    })
  }, [transactions, rules, dismissed, isPlus])

  async function acceptCandidate(c: RecurringPatternCandidate) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Anchor BOTH starts_at and last_generated to the candidate's own
    // last-seen date (fix-plan 2.3(b)) — `starts_at` alone as "now" was
    // a latent second bug: with no anchor_day/anchor_weekday/anchor_time
    // columns set, the recurrence engine derives the day-of-month clamp
    // from `starts_at` (`resolveAnchor` in packages/shared/src/domain/
    // recurrence.ts), so a Netflix bill that always charges on the 5th,
    // accepted on the 20th, would have clamped to the 20th forever.
    const anchorInstant = c.lastSeenAt
    const anchorParts = localParts(anchorInstant, tz)
    // Reuse the template transaction's own FX snapshot rather than a
    // fresh lookup — same amount, same currency, same day, so it's
    // exact (fix-plan 2.1's "snapshotted on create/update").
    const template = transactions.find((t) => t.id === c.templateTxnId)

    const { error } = await supabase.from('recurring_rules').insert({
      user_id: user.id,
      client_id: crypto.randomUUID(),
      name: c.merchant,
      amount: c.amount,
      currency_code: c.currency_code,
      category_id: c.category_id,
      direction: c.direction,
      payment_method: c.payment_method,
      note: null,
      frequency: c.frequency,
      interval: 1,
      starts_at: anchorInstant,
      ends_at: null,
      last_generated: anchorInstant,
      is_active: true,
      template_txn_id: c.templateTxnId,
      amount_in_profile_currency: template?.amount_in_profile_currency ?? null,
      fx_rate_to_profile: template?.fx_rate_to_profile ?? null,
      fx_rate_date: template?.fx_rate_date ?? null,
      anchor_day: anchorParts.d,
      anchor_weekday: anchorParts.weekdayIndex + 1,
      anchor_time: `${String(anchorParts.hour).padStart(2, '0')}:${String(anchorParts.minute).padStart(2, '0')}:${String(anchorParts.second).padStart(2, '0')}`,
    })
    if (error) {
      // One active rule per (user, direction, name) — a same-merchant
      // candidate (e.g. a price change) merges into the existing rule
      // instead of silently vanishing.
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('recurring_rules')
          .select('id')
          .eq('user_id', user.id)
          .eq('direction', c.direction)
          .eq('is_active', true)
          .ilike('name', c.merchant)
          .limit(1)
          .maybeSingle()
        if (existing) {
          await supabase
            .from('recurring_rules')
            .update({
              amount: c.amount,
              frequency: c.frequency,
              category_id: c.category_id,
              payment_method: c.payment_method,
              last_generated: c.lastSeenAt,
              amount_in_profile_currency: template?.amount_in_profile_currency ?? null,
              fx_rate_to_profile: template?.fx_rate_to_profile ?? null,
              fx_rate_date: template?.fx_rate_date ?? null,
            })
            .eq('id', existing.id)
        }
      } else {
        window.alert(`Could not set up the recurring rule: ${error.message}`)
        return
      }
    }
    await load()
  }

  function dismissCandidate(c: RecurringPatternCandidate) {
    if (!userId) return
    const next = new Set(dismissed)
    next.add(c.key)
    setDismissed(next)
    writeDismissed(userId, next)
  }

  async function toggleActive(rule: RecurringRule) {
    await supabase.from('recurring_rules').update({ is_active: !rule.is_active }).eq('id', rule.id)
    await load()
  }

  // Create/edit/cancel — fix-plan 3.3. "Add manually" was a permanently
  // `disabled` button and the only mutation this page had was pause/
  // resume; a rule could not be created, edited or deleted from web at
  // all without going through a transaction or a detected pattern.
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)

  function openCreateModal() {
    setModalMode('create')
    setEditingRule(null)
    setModalOpen(true)
  }
  // `?new=1` — Ask Murmur's "Add a recurring rule" action (SPEC §1.4).
  const searchParams = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new') === '1') openCreateModal()
  }, [searchParams])

  function openEditModal(rule: RecurringRule) {
    setModalMode('edit')
    setEditingRule(rule)
    setModalOpen(true)
  }

  async function handleModalSave(values: RecurringRuleFormValues): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false

    const anchorParts = localParts(values.starts_at, tz)
    const anchorPayload = {
      anchor_day: anchorParts.d,
      anchor_weekday: anchorParts.weekdayIndex + 1,
      anchor_time: `${String(anchorParts.hour).padStart(2, '0')}:${String(anchorParts.minute).padStart(2, '0')}:${String(anchorParts.second).padStart(2, '0')}`,
    }

    if (modalMode === 'edit' && editingRule) {
      // Amount/currency changed: re-snapshot FX in place (fix-plan 2.1's
      // "snapshotted on create/update"). A `starts_at` edit ("next
      // charge") re-anchors `last_generated` to null so the new date is
      // the literal next occurrence rather than one cadence step past
      // it — mirrors `useRecurringRules.ts`'s `updateRule` on mobile.
      let fxPayload: { amount_in_profile_currency: number | null; fx_rate_to_profile: number | null; fx_rate_date: string | null } | null = null
      const amountOrCurrencyChanged =
        values.amount !== editingRule.amount || values.currency_code !== editingRule.currency_code
      if (amountOrCurrencyChanged) {
        const fx = await snapshotFx(values.starts_at, values.currency_code, currency, values.amount, tz)
        fxPayload = fx
      }
      const startsAtChanged = values.starts_at !== editingRule.starts_at
      const { error } = await supabase
        .from('recurring_rules')
        .update({
          name: values.name,
          amount: values.amount,
          currency_code: values.currency_code,
          category_id: values.category_id,
          direction: values.direction,
          frequency: values.frequency,
          interval: values.interval,
          ends_at: values.ends_at,
          ...(startsAtChanged ? { starts_at: values.starts_at, last_generated: null, ...anchorPayload } : {}),
          ...(fxPayload ?? {}),
        })
        .eq('id', editingRule.id)
      if (error) {
        window.alert(`Could not save this rule: ${error.message}`)
        return false
      }
      await load()
      return true
    }

    // Create — no template transaction, so `last_generated` stays null:
    // `starts_at` (the form's own "next date") is the pending first
    // occurrence, exactly like mobile's manual-creation path.
    const fx = await snapshotFx(values.starts_at, values.currency_code, currency, values.amount, tz)
    const { error } = await supabase.from('recurring_rules').insert({
      user_id: user.id,
      client_id: crypto.randomUUID(),
      name: values.name,
      amount: values.amount,
      currency_code: values.currency_code,
      category_id: values.category_id,
      direction: values.direction,
      payment_method: null,
      note: null,
      frequency: values.frequency,
      interval: values.interval,
      starts_at: values.starts_at,
      ends_at: values.ends_at,
      last_generated: null,
      template_txn_id: null,
      is_active: true,
      amount_in_profile_currency: fx?.amount_in_profile_currency ?? null,
      fx_rate_to_profile: fx?.fx_rate_to_profile ?? null,
      fx_rate_date: fx?.fx_rate_date ?? null,
      ...anchorPayload,
    })
    if (error) {
      window.alert(`Could not create this rule: ${error.message}`)
      return false
    }
    await load()
    return true
  }

  // Soft delete (fix-plan 3.3's explicit "delete (soft)" requirement) —
  // mirrors `useRecurringRules.ts`'s `deleteRule` on mobile rather than a
  // hard `.delete()`, which would bypass the `is_deleted` contract every
  // other synced entity on this table carries (migration 018/028).
  async function handleDeleteRule(rule: RecurringRule) {
    if (!window.confirm(`Cancel ${rule.name ?? 'this recurring rule'}? This can't be undone.`)) return
    await supabase
      .from('recurring_rules')
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), version: (rule.version ?? 1) + 1 })
      .eq('id', rule.id)
    setModalOpen(false)
    await load()
  }

  const active = rules.filter((r) => r.is_active)
  const inactive = rules.filter((r) => !r.is_active)

  // Debit-only, FX-normalised (fix-plan 2.1's "Done when": a 4000/mo
  // credit rule alongside a 15/mo debit rule must produce a hero of 15,
  // not 4015 — this page's "Monthly"/"Annual cost" stats are this
  // surface's hero). An active income rule no longer inflates either
  // figure; it simply isn't counted here.
  const outflowRules = active.filter((r) => r.direction === 'debit')
  const monthlyTotal = outflowRules.reduce(
    (sum, r) => sum + monthlyEquivalent({ ...r, amount: fxAmount(r) }),
    0,
  )
  const annualTotal = outflowRules.reduce(
    (sum, r) => sum + annualEquivalent({ ...r, amount: fxAmount(r) }),
    0,
  )
  const reviewCount = candidates.length // Detected = "to review"

  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  const fmtShort = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  // Sorted active rules by next-charge date.
  const sortedActive = useMemo(() => {
    return [...active].sort((a, b) => {
      const an = nextOccurrence(a, tz)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const bn = nextOccurrence(b, tz)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return an - bn
    })
  }, [active, tz])

  // Charges in next 30 days (each entry = a day-offset 1..30 with a rule).
  const charges = useMemo(() => chargesIn30Days(active, tz), [active, tz])

  // Real dates for the 30-day strip's grid (fix-plan 2.4 — this is the
  // "recurring 'Next 30 days' strip must be built from real dates with
  // leading blanks and day-of-month labels rather than 1..30 offsets
  // under a `M T W T F S S` header" item). `weekdayIndex` (Monday=0…
  // Sunday=6, from `period.ts`'s `localParts`) is what lets the grid
  // put day-offset 1 under its real weekday column instead of always
  // starting a fresh Monday-shaped row at "today", which is what the
  // fixed offset numbering under a static header did.
  const next30Days = useMemo(() => {
    const todayIso = localDay(new Date().toISOString(), tz)
    const [ty, tm, td] = todayIso.split('-').map(Number)
    return Array.from({ length: 30 }, (_, i) => {
      const target = addDays(ty, tm, td, i)
      const instant = civilDateTimeToInstant(target.y, target.m, target.d, 12, 0, 0, tz)
      const local = localParts(instant, tz)
      return { dayOffset: i + 1, dayOfMonth: local.d, weekdayIndex: local.weekdayIndex }
    })
  }, [tz])
  const chargesByDay = useMemo(() => {
    const m: Record<number, Array<RecurringRule>> = {}
    for (const c of charges) {
      if (!m[c.day]) m[c.day] = []
      m[c.day].push(c.rule)
    }
    return m
  }, [charges])

  // Total + heaviest day for the calendar footer.
  const totalCharges = charges.reduce((s, c) => s + c.rule.amount, 0)
  const heaviestEntry = (() => {
    let bestDay = 0
    let bestSum = 0
    for (const [d, rs] of Object.entries(chargesByDay)) {
      const sum = rs.reduce((s, r) => s + r.amount, 0)
      if (sum > bestSum) {
        bestSum = sum
        bestDay = Number(d)
      }
    }
    return { day: bestDay, sum: bestSum }
  })()
  const heaviestDate = heaviestEntry.day ? dayOffsetToLabel(heaviestEntry.day, tz, locale) : null

  // "Potential savings" card content. Use the candidates the model flagged
  // as new subscriptions you might not have intended — sum them as the
  // "if you cancel" upper bound.
  // Derived from the same filtered set that produces `reviewCount`
  // (fix-plan 2.1) — the old `c.frequency === 'monthly' ? c.amount : 0`
  // silently dropped every weekly/quarterly/yearly candidate from the
  // sum while still counting it in "N flagged" a few lines below.
  const potentialMonthly = candidates.reduce(
    (s, c) => s + monthlyEquivalent({ frequency: c.frequency, interval: 1, amount: c.amount }),
    0,
  )
  const potentialYearly = potentialMonthly * 12

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        title="Recurring"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={styles.sortPill}>Sort: Next charge</span>
            {/* Fix-plan 3.3: this was permanently `disabled title="Coming
                soon"` — a priced-looking control that could never be
                pressed. A rule can now be created without touching a
                transaction, on both platforms. */}
            <button style={styles.addBtn} type="button" onClick={openCreateModal}>
              <Icon.plus color="#fff" size={12} />
              Add manually
            </button>
          </div>
        }
      />

      <div style={styles.content}>
        <div style={styles.headerRow}>
          <div>
            {/* Matches the sidebar label, the toolbar title above, and the
                mobile screen's own heading — one name, not a fourth
                variant (audit 08-F44, fix-plan 4.2's naming-table item). */}
            <div style={styles.serifTitle}>Recurring</div>
            <div style={styles.subtitleLine}>
              {isPlus ? (
                <>
                  Auto-detected from your spend patterns.{' '}
                  {reviewCount > 0 ? (
                    <b style={{ color: colors.accent }}>{reviewCount} worth reviewing.</b>
                  ) : (
                    <span>{loading ? 'Loading…' : 'No new patterns to review.'}</span>
                  )}
                </>
              ) : (
                // Free users never ran the detector at all — `candidates`
                // short-circuits to `[]` above (audit 03-F33) — so this
                // must not assert "no new patterns" as a finding about
                // their data. It's a fact about their plan, not their
                // spending.
                <span>
                  Pattern detection is a{' '}
                  <Link href="/dashboard/settings" style={{ color: colors.accent, textDecoration: 'none' }}>
                    Murmur Plus
                  </Link>{' '}
                  feature.
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
            <Stat label="Monthly" value={fmtShort(monthlyTotal)} />
            <Stat label="Annual cost" value={fmtShort(annualTotal)} />
            {/* "—" for free users, not "0" — the detector never ran for
                them (same fact as the subtitle above), and "0" would
                assert a finding about their data instead of their plan. */}
            <Stat label="To review" value={isPlus ? String(reviewCount) : '—'} accent="#B07B2A" />
          </div>
        </div>

        {/* Detected patterns banner (Plus) */}
        {isPlus && candidates.length > 0 && (
          <div style={styles.detectedCard}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: colors.ink3,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              New patterns detected
            </div>
            {candidates.slice(0, 5).map((c, i) => {
              const catName = c.category_id ? catMap[c.category_id]?.name ?? null : null
              return (
                <div
                  key={c.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 4px',
                    borderTop: i === 0 ? 'none' : `0.5px solid ${colors.line}`,
                  }}
                >
                  <MerchantLogo
                    name={c.merchant}
                    categoryName={catName}
                    categoryColor={catMap[c.category_id ?? '']?.color ?? null}
                    size={32}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: colors.ink }}>
                      {c.merchant}
                    </div>
                    <div style={{ fontSize: 11, color: colors.ink3, marginTop: 2 }}>
                      {c.occurrences} occurrences · likely {freqLabel(c.frequency).toLowerCase()}
                    </div>
                  </div>
                  <Money
                    value={-c.amount}
                    currency={c.currency_code || currency}
                    locale={locale}
                    size={13}
                    serif={false}
                    bold={700}
                  />
                  <button onClick={() => acceptCandidate(c)} style={styles.acceptBtn}>
                    Set up
                  </button>
                  <button onClick={() => dismissCandidate(c)} style={styles.dismissBtn}>
                    Not now
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Body: table + right rail */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14, minHeight: 530 }}>
          <div style={styles.tableCard}>
            <div style={styles.tableHead}>
              <div>Service</div>
              <div>Amount</div>
              <div>Frequency</div>
              <div>Next charge</div>
              <div style={{ textAlign: 'right' }}>Status</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={styles.empty}>Loading…</div>
              ) : loadError ? (
                <ErrorState message="We couldn't load your recurring rules." detail={loadError} onRetry={load} />
              ) : sortedActive.length === 0 && inactive.length === 0 ? (
                // Fix-plan 3.3: plan-aware — "accept a detected pattern"
                // is a Plus feature (the banner above only renders when
                // `isPlus`), so naming it here for a free user pointed at
                // a control they can't reach. "Add manually" now works on
                // every plan, so it's the one action worth naming for
                // everyone.
                <div style={styles.empty}>
                  No recurring rules yet. Add one manually, mark a transaction as recurring on mobile
                  {isPlus ? ', or accept a detected pattern below.' : '.'}
                </div>
              ) : (
                <>
                  {sortedActive.map((r, i) => {
                    const next = nextOccurrence(r, tz)
                    // Overdue — pending generation (fix-plan 2.1 / 03-F24):
                    // the mechanically-next occurrence already fell in the
                    // past, i.e. generation hasn't caught up yet. Rendered
                    // as its own state rather than a stale past date sorted
                    // as imminent (sort order is unaffected — a past instant
                    // already sorts first among `sortedActive`, which is
                    // ascending by this same value).
                    const overdue = next != null && next.getTime() < Date.now()
                    const catName = r.category_id ? catMap[r.category_id]?.name ?? null : null
                    return (
                      <div
                        key={r.id}
                        onClick={() => openEditModal(r)}
                        // A real <button> can't wrap this row — it already
                        // nests the ACTIVE pill button, and buttons cannot
                        // nest inside buttons. role="button" + tabIndex +
                        // onKeyDown is the fix-plan's named alternative
                        // (4.1) for exactly this shape.
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEditModal(r)
                          }
                        }}
                        aria-label={`Edit ${r.name ?? 'recurring rule'}`}
                        style={{
                          ...styles.tableRow,
                          cursor: 'pointer',
                          borderBottom:
                            i === sortedActive.length - 1 && inactive.length === 0
                              ? 'none'
                              : `0.5px solid ${colors.line}`,
                        }}
                      >
                        <div style={styles.serviceCell}>
                          <MerchantLogo
                            name={r.name}
                            categoryName={catName}
                            categoryColor={r.category_id ? catMap[r.category_id]?.color ?? null : null}
                            size={28}
                            radius={8}
                          />
                          <span style={{ color: colors.ink, fontWeight: 600 }}>
                            {r.name ?? 'Recurring'}
                          </span>
                        </div>
                        <div>
                          <Money
                            value={r.direction === 'credit' ? r.amount : -r.amount}
                            currency={r.currency_code || currency}
                            locale={locale}
                            size={13}
                            serif={false}
                            bold={700}
                          />
                        </div>
                        <div style={{ color: colors.ink3, fontSize: 12, textTransform: 'capitalize' }}>
                          {freqLabel(r.frequency)}
                        </div>
                        <div style={{ color: overdue ? colors.accent : colors.ink2, fontSize: 12, fontWeight: overdue ? 700 : 400 }}>
                          {overdue
                            ? 'Overdue'
                            : next
                              ? next.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                              : '—'}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {/* Text now matches the action the click performs
                              (audit 03-F36/08-F49) — it used to read
                              "ACTIVE" while `title` said "Pause", a status
                              word standing in for a toggle button. */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleActive(r)
                            }}
                            style={styles.activePill}
                            title="Pause"
                            aria-pressed="true"
                          >
                            Pause
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {inactive.map((r, i) => {
                    const catName = r.category_id ? catMap[r.category_id]?.name ?? null : null
                    return (
                      <div
                        key={r.id}
                        onClick={() => openEditModal(r)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openEditModal(r)
                          }
                        }}
                        aria-label={`Edit ${r.name ?? 'recurring rule'}`}
                        style={{
                          ...styles.tableRow,
                          opacity: 0.6,
                          cursor: 'pointer',
                          borderBottom:
                            i === inactive.length - 1 ? 'none' : `0.5px solid ${colors.line}`,
                        }}
                      >
                        <div style={styles.serviceCell}>
                          <MerchantLogo
                            name={r.name}
                            categoryName={catName}
                            categoryColor={r.category_id ? catMap[r.category_id]?.color ?? null : null}
                            size={28}
                            radius={8}
                          />
                          <span style={{ color: colors.ink, fontWeight: 600 }}>
                            {r.name ?? 'Recurring'}
                          </span>
                        </div>
                        <div>
                          <Money
                            value={r.direction === 'credit' ? r.amount : -r.amount}
                            currency={r.currency_code || currency}
                            locale={locale}
                            size={13}
                            serif={false}
                            bold={700}
                          />
                        </div>
                        <div style={{ color: colors.ink3, fontSize: 12, textTransform: 'capitalize' }}>
                          {freqLabel(r.frequency)}
                        </div>
                        <div style={{ color: colors.ink4, fontSize: 12 }}>Paused</div>
                        <div style={{ textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleActive(r)
                            }}
                            style={styles.resumePill}
                            aria-pressed="false"
                          >
                            Resume
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          {/* Right rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={styles.calendarCard}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: colors.ink3,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                Next 30 days · charges
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: colors.ink4,
                      textAlign: 'center',
                    }}
                  >
                    {d}
                  </div>
                ))}
                {/* Leading blanks so day-offset 1 (today) lands under its
                    real weekday column, exactly like Calendar.tsx's month
                    grid — a fixed offset numbering under a static header
                    always started a fresh "Monday" row at today instead. */}
                {Array.from({ length: next30Days[0]?.weekdayIndex ?? 0 }).map((_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {next30Days.map(({ dayOffset, dayOfMonth }) => {
                  const items = chargesByDay[dayOffset]
                  return (
                    <div
                      key={dayOffset}
                      style={{
                        aspectRatio: 1,
                        borderRadius: 6,
                        background: items ? colors.accentSoft : colors.surface,
                        border: items ? `0.5px solid ${colors.accent}` : `0.5px solid ${colors.line}`,
                        padding: 4,
                        display: 'flex',
                        flexDirection: 'column',
                        fontSize: 9,
                        color: items ? colors.accent : colors.ink4,
                        fontWeight: 700,
                      }}
                    >
                      <div>{dayOfMonth}</div>
                      {items && (
                        <div style={{ marginTop: 'auto', fontSize: 8, lineHeight: 1.1, fontWeight: 700 }}>
                          {items.length}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {totalCharges > 0 && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    background: colors.surface,
                    borderRadius: 10,
                    fontSize: 12,
                    color: colors.ink2,
                    lineHeight: 1.5,
                  }}
                >
                  <b style={{ color: colors.ink }}>{fmtShort(totalCharges)}</b> in charges hit before{' '}
                  {dayOffsetToLabel(31, tz, locale)}
                  .
                  {heaviestDate && (
                    <>
                      {' '}
                      Heaviest day: <b style={{ color: colors.ink }}>{heaviestDate}</b>.
                    </>
                  )}
                </div>
              )}
            </div>

            {potentialMonthly > 0 && (
              <div style={styles.savingsCard}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.5)',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  Potential savings
                </div>
                <div
                  style={{
                    fontFamily: font.serif,
                    fontSize: 22,
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}
                >
                  Cancelling the {candidates.length} flagged →{' '}
                  <span style={{ color: '#C9D6BE' }}>
                    {fmtShort(potentialMonthly)}/mo · {fmtShort(potentialYearly)}/yr
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <RecurringRuleModal
        open={modalOpen}
        mode={modalMode}
        initial={editingRule}
        categories={categories}
        defaultCurrency={currency}
        tz={tz}
        onSave={handleModalSave}
        onClose={() => setModalOpen(false)}
        onDelete={editingRule ? () => handleDeleteRule(editingRule) : undefined}
      />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          fontFamily: font.display,
          fontSize: 22,
          fontWeight: 700,
          color: accent || colors.ink,
          letterSpacing: -0.4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: font.sans,
          fontSize: 10,
          color: colors.ink3,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  serifTitle: {
    fontFamily: font.serif,
    fontSize: 28,
    fontWeight: 500,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  subtitleLine: {
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 2,
  },
  sortPill: {
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    background: 'rgba(255,255,255,0.7)',
    borderRadius: 8,
    border: `0.5px solid ${colors.line}`,
    color: colors.ink2,
    fontFamily: font.sans,
  },
  addBtn: {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    background: colors.ink,
    color: '#fff',
    borderRadius: 8,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: font.sans,
    cursor: 'pointer',
  },
  detectedCard: {
    background: colors.card,
    borderRadius: radius.xl,
    border: `1.5px dashed ${colors.accent}`,
    padding: 16,
    fontFamily: font.sans,
  },
  acceptBtn: {
    padding: '6px 12px',
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dismissBtn: {
    padding: '6px 10px',
    background: 'transparent',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.ink3,
    cursor: 'pointer',
  },
  tableCard: {
    background: colors.card,
    borderRadius: radius.xl,
    border: `0.5px solid ${colors.line}`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.sans,
  },
  tableHead: {
    padding: '12px 16px',
    display: 'grid',
    gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1fr 90px',
    fontSize: 10,
    fontWeight: 700,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    background: colors.surface,
    borderBottom: `0.5px solid ${colors.line}`,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1.6fr 0.9fr 0.9fr 1fr 90px',
    padding: '12px 16px',
    fontSize: 13,
    alignItems: 'center',
    gap: 8,
  },
  serviceCell: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  activePill: {
    fontSize: 11,
    fontWeight: 700,
    color: colors.accent,
    background: colors.accentSoft,
    padding: '3px 8px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontFamily: font.sans,
  },
  resumePill: {
    fontSize: 11,
    fontWeight: 700,
    color: '#fff',
    background: colors.accent,
    padding: '3px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontFamily: font.sans,
  },
  calendarCard: {
    background: colors.card,
    borderRadius: radius.xl,
    border: `0.5px solid ${colors.line}`,
    padding: 18,
    fontFamily: font.sans,
  },
  savingsCard: {
    background: colors.ink,
    borderRadius: radius.xl,
    padding: 18,
    color: '#fff',
    fontFamily: font.sans,
  },
  empty: {
    padding: '40px 20px',
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    textAlign: 'center',
  },
}
