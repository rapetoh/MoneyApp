'use client'
/* eslint-disable local/period-restrictions -- Stage 2 (2.4/2.14) migration
 * pending: this page's occurrence/window math hasn't been converted onto
 * packages/shared/src/domain/recurrence.ts + period.ts yet (fix-plan 2.3
 * owns the recurring-rules rewrite) — out of item 1.3's own named
 * surfaces. */
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Money } from '../../../components/Money'
import { MerchantLogo } from '../../../components/MerchantLogo'
import { Icon } from '../../../components/Icons'
import {
  detectRecurringPatterns,
  type RecurringPatternCandidate,
} from '../../../lib/recurringPatternDetector'
import { usePlus } from '../../../lib/plus'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'
import {
  nextOccurrence as sharedNextOccurrence,
  monthlyEquivalent,
  annualEquivalent,
} from '@voice-expense/shared'

type Txn = {
  id: string
  amount: number
  currency_code: string
  direction: 'debit' | 'credit'
  merchant: string | null
  category_id: string | null
  payment_method: string | null
  transacted_at: string
  is_deleted: boolean
  is_recurring: boolean
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
// 31st permanently drifted to the 3rd after the first February. `tz`
// is the browser's own zone (`Intl.DateTimeFormat().resolvedOptions()
// .timeZone`, resolved once per render below) rather than
// `profile.timezone`: nothing writes that column from web yet
// (fix-plan 1.3's device-zone capture is mobile-only so far), so it
// reads the schema default `'UTC'` for every profile and would be
// wrong for most users — the browser's own zone is the more accurate
// signal available on this page today.
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

// Walk forward N days from `from`, emitting every charge from each rule.
function chargesIn30Days(rules: RecurringRule[], tz: string): Array<{ day: number; rule: RecurringRule }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(today.getDate() + 30)
  const out: Array<{ day: number; rule: RecurringRule }> = []
  for (const r of rules) {
    if (!r.is_active) continue
    let nxt = nextOccurrence(r, tz)
    let safety = 0
    while (nxt && nxt <= horizon && safety < 60) {
      if (nxt >= today) {
        const dayOffset = Math.round((nxt.getTime() - today.getTime()) / 86_400_000)
        out.push({ day: dayOffset + 1, rule: r })
      }
      nxt = nextOccurrence(r, tz, nxt)
      safety += 1
    }
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
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  // See the `nextOccurrence` docstring above for why this is the
  // browser's zone rather than `profile.timezone`.
  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      return 'UTC'
    }
  }, [])

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
      supabase.from('profiles').select('currency_code, locale').eq('id', user.id).single(),
    ])
    setRules((r.data ?? []) as RecurringRule[])
    setTransactions((t.data ?? []) as Txn[])
    setCategories((c.data ?? []) as Cat[])
    setProfile(p.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Realtime. Without this, the user accepting a "new pattern detected"
  // banner on mobile (or adding a rule from the edit screen there)
  // leaves the desktop Recurring page showing yesterday's list until
  // the user reloads — the page would also miss new transactions that
  // feed the candidate detector. One channel covers both tables.
  useEffect(() => {
    let userId: string | null = null
    let active = true
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return
      userId = user.id
      const channel = supabase
        .channel(`web:recurring:${userId}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'recurring_rules', filter: `user_id=eq.${userId}` },
          () => { void load() },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
          () => { void load() },
        )
        .subscribe()
      return () => {
        active = false
        channel.unsubscribe()
        void supabase.removeChannel(channel)
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const startsAt = new Date().toISOString()
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
      starts_at: startsAt,
      ends_at: null,
      last_generated: c.lastSeenAt,
      is_active: true,
      template_txn_id: c.templateTxnId,
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

  const active = rules.filter((r) => r.is_active)
  const inactive = rules.filter((r) => !r.is_active)

  const monthlyTotal = active.reduce((sum, r) => sum + monthlyEquivalent(r), 0)
  const annualTotal = active.reduce((sum, r) => sum + annualEquivalent(r), 0)
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
  const heaviestDate = heaviestEntry.day
    ? (() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + heaviestEntry.day - 1)
        return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
      })()
    : null

  // "Potential savings" card content. Use the candidates the model flagged
  // as new subscriptions you might not have intended — sum them as the
  // "if you cancel" upper bound.
  const potentialMonthly = candidates.reduce((s, c) => s + (c.frequency === 'monthly' ? c.amount : 0), 0)
  const potentialYearly = potentialMonthly * 12

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        title="Recurring"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={styles.sortPill}>Sort: Next charge</span>
            <button style={styles.addBtn} type="button" disabled title="Coming soon">
              <Icon.plus color="#fff" size={12} />
              Add manually
            </button>
          </div>
        }
      />

      <div style={styles.content}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.serifTitle}>Recurring & subscriptions</div>
            <div style={styles.subtitleLine}>
              Auto-detected from your spend patterns.{' '}
              {reviewCount > 0 ? (
                <b style={{ color: colors.accent }}>{reviewCount} worth reviewing.</b>
              ) : (
                <span>{loading ? 'Loading…' : 'No new patterns to review.'}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
            <Stat label="Monthly" value={fmtShort(monthlyTotal)} />
            <Stat label="Annual cost" value={fmtShort(annualTotal)} />
            <Stat label="To review" value={String(reviewCount)} accent="#B07B2A" />
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
              ) : sortedActive.length === 0 && inactive.length === 0 ? (
                <div style={styles.empty}>
                  No recurring rules yet. Mark a transaction as recurring on mobile or accept a detected pattern.
                </div>
              ) : (
                <>
                  {sortedActive.map((r, i) => {
                    const next = nextOccurrence(r, tz)
                    const catName = r.category_id ? catMap[r.category_id]?.name ?? null : null
                    return (
                      <div
                        key={r.id}
                        style={{
                          ...styles.tableRow,
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
                        <div style={{ color: colors.ink2, fontSize: 12 }}>
                          {next ? next.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '—'}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <button onClick={() => toggleActive(r)} style={styles.activePill} title="Pause">
                            ACTIVE
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
                        style={{
                          ...styles.tableRow,
                          opacity: 0.6,
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
                          <button onClick={() => toggleActive(r)} style={styles.resumePill}>
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
                {Array.from({ length: 30 }).map((_, i) => {
                  const day = i + 1
                  const items = chargesByDay[day]
                  return (
                    <div
                      key={day}
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
                      <div>{day}</div>
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
                  {(() => {
                    const d = new Date()
                    d.setDate(d.getDate() + 30)
                    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                  })()}
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
