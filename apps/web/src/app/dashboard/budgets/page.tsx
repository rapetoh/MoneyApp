'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius, cat, type CategoryTint } from '../../../lib/theme'
import { tintFor } from '../../../lib/categories'
import { Toolbar } from '../../../components/Toolbar'
import { Money } from '../../../components/Money'
import { Chip } from '../../../components/Chip'
import { Icon } from '../../../components/Icons'
import type { BudgetPeriod } from '@voice-expense/shared'
import { aggAmount } from '@voice-expense/shared'

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

type Cat = { id: string; name: string }
type Txn = {
  amount: number
  amount_in_profile_currency: number | null
  direction: 'debit' | 'credit'
  transacted_at: string
  category_id: string | null
}
type Budget = {
  id: string
  amount: number
  period: BudgetPeriod
  category_id: string | null
  is_active: boolean
}

function periodStart(period: BudgetPeriod, ref = new Date()): Date {
  const now = new Date(ref)
  if (period === 'weekly') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    const start = new Date(now)
    start.setDate(now.getDate() - diff)
    start.setHours(0, 0, 0, 0)
    return start
  }
  if (period === 'biweekly') {
    const start = new Date(now)
    start.setDate(now.getDate() - 13)
    start.setHours(0, 0, 0, 0)
    return start
  }
  if (period === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3)
    return new Date(now.getFullYear(), q * 3, 1)
  }
  if (period === 'yearly') {
    return new Date(now.getFullYear(), 0, 1)
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

export default function BudgetsPage() {
  const supabase = createClient()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [categoryId, setCategoryId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [b, t, c, p] = await Promise.all([
      supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      // `amount_in_profile_currency` is required — aggregations use it
      // via `aggAmount(t)`. Without it the column comes back undefined
      // and every total resolves to 0.
      supabase
        .from('transactions')
        .select('amount, amount_in_profile_currency, direction, transacted_at, category_id')
        .eq('user_id', user.id)
        .eq('is_deleted', false),
      supabase.from('categories').select('id, name').eq('user_id', user.id).eq('is_archived', false),
      supabase.from('profiles').select('currency_code, locale').eq('id', user.id).single(),
    ])
    setBudgets((b.data ?? []) as Budget[])
    setTransactions((t.data ?? []) as Txn[])
    setCategories((c.data ?? []) as Cat[])
    setProfile(p.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Realtime — re-fetch whenever the user's own transactions or
  // budgets change. Without this, an expense logged on mobile leaves
  // the desktop Budgets ring stuck on stale numbers until the user
  // reloads the page (DESKTOP §4.4). The channel name is randomised
  // so React Strict Mode's double-invoke never collides with itself,
  // matching the mobile pattern in useTransactions.
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    async function subscribe() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return

      const channelName = `web:budgets:${user.id}:${Math.random().toString(36).slice(2)}`
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter: `user_id=eq.${user.id}`,
          },
          () => { void load() },
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'budgets',
            filter: `user_id=eq.${user.id}`,
          },
          () => { void load() },
        )
        .subscribe()

      cleanup = () => {
        channel.unsubscribe()
        supabase.removeChannel(channel)
      }
    }

    void subscribe()
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  async function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) {
      setError('Enter a valid amount')
      return
    }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Deactivate existing for the same scope
    await supabase
      .from('budgets')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('period', period)
      .eq('category_id', categoryId || null)

    const { error: err } = await supabase.from('budgets').insert({
      user_id: user.id,
      amount: parsed,
      period,
      category_id: categoryId || null,
      is_active: true,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setShowForm(false)
    setAmount('')
    setCategoryId('')
    await load()
  }

  async function handleRemove(id: string) {
    await supabase.from('budgets').update({ is_active: false }).eq('id', id)
    await load()
  }

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const overall = useMemo(() => {
    // Prefer a monthly overall — that's the default shape — but fall
    // back to any null-category budget the user set with a different
    // period (weekly, biweekly, quarterly, yearly).
    return budgets.find((b) => b.category_id === null && b.period === 'monthly') ?? budgets.find((b) => b.category_id === null)
  }, [budgets])

  // Spend math must match the overall budget's period. Previously this
  // was hardcoded to `periodStart('monthly')`, which meant a user with
  // a weekly $500 budget compared their week's cap against a full
  // calendar month of spending — the ring lit up at >100% almost
  // immediately. The window now follows the budget itself.
  const overallSpent = useMemo(() => {
    const start = periodStart(overall?.period ?? 'monthly')
    return transactions
      .filter((t) => t.direction === 'debit' && new Date(t.transacted_at) >= start)
      .reduce((s, t) => s + aggAmount(t), 0)
  }, [transactions, overall])

  const overallPct = overall ? Math.min(overallSpent / overall.amount, 1) : 0
  const overallRemaining = overall ? Math.max(0, overall.amount - overallSpent) : 0

  // Buckets by status for the per-category list
  const perCat = useMemo(() => {
    return budgets
      .filter((b) => b.category_id !== null)
      .map((b) => {
        const cName = b.category_id ? catMap[b.category_id]?.name ?? '—' : '—'
        const start = periodStart(b.period)
        const spent = transactions
          .filter(
            (t) =>
              t.direction === 'debit' &&
              t.category_id === b.category_id &&
              new Date(t.transacted_at) >= start,
          )
          .reduce((s, t) => s + aggAmount(t), 0)
        const pct = spent / b.amount
        return { id: b.id, name: cName, period: b.period, cap: b.amount, spent, pct }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [budgets, transactions, catMap])

  const stats = useMemo(() => {
    let onTrack = 0
    let near = 0
    let over = 0
    for (const r of perCat) {
      if (r.pct > 1) over++
      else if (r.pct > 0.9) near++
      else onTrack++
    }
    return { onTrack, near, over }
  }, [perCat])

  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  const fmtShort = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        title="Budgets"
        right={
          <button
            onClick={() => setShowForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: colors.ink,
              color: '#fff',
              borderRadius: radius.md,
              border: 'none',
              fontFamily: font.sans,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Icon.plus color="#fff" size={12} /> New budget
          </button>
        }
      />

      <div style={styles.content}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 16,
          }}
        >
          <div>
            <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
              {periodTitle(overall?.period ?? 'monthly', locale)} budgets
            </div>
            <div style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
              {overall ? (
                <>
                  You've used <b style={{ color: colors.ink }}>{fmtShort(overallSpent)}</b> of{' '}
                  <b style={{ color: colors.ink }}>{fmtShort(overall.amount)}</b> {periodSuffix(overall.period)}.
                </>
              ) : (
                <>Set a monthly budget to start tracking.</>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Stat label="On track" value={stats.onTrack} color={colors.accent} />
            <Stat label="Near limit" value={stats.near} color={colors.warn} />
            <Stat label="Over" value={stats.over} color="#A94646" />
          </div>
        </div>

        {showForm && (
          <div style={styles.formCard}>
            <div style={styles.formTitle}>New budget</div>
            {error && <div style={styles.error}>{error}</div>}
            <div style={styles.formRow}>
              <div style={styles.field}>
                <label style={styles.label}>Amount</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                  autoFocus
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Period</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as BudgetPeriod)}
                  style={styles.select}
                >
                  {PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Scope</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={styles.select}>
                  <option value="">Overall</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowForm(false)
                  setError(null)
                }}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14 }}>
          {/* Overall ring */}
          <div style={styles.ringCard}>
            <div style={styles.eyebrow}>Overall</div>
            <svg width="220" height="220" viewBox="0 0 220 220" style={{ margin: '10px 0' }}>
              <circle cx="110" cy="110" r="88" fill="none" stroke={colors.surface2} strokeWidth="18" />
              {overall && (
                <circle
                  cx="110"
                  cy="110"
                  r="88"
                  fill="none"
                  stroke={overallPct > 1 ? '#A94646' : colors.accent}
                  strokeWidth="18"
                  strokeDasharray={`${2 * Math.PI * 88 * overallPct} ${2 * Math.PI * 88 * (1 - overallPct)}`}
                  transform="rotate(-90 110 110)"
                  strokeLinecap="round"
                />
              )}
              <text x="110" y="100" textAnchor="middle" fontSize="12" fill={colors.ink3} fontWeight="600">
                {overall ? `${Math.round(overallPct * 100)}% used` : 'No overall budget'}
              </text>
              <text
                x="110"
                y="128"
                textAnchor="middle"
                fontSize="26"
                fontWeight="700"
                fontFamily={font.display}
                fill={colors.ink}
              >
                {fmtShort(overallSpent)}
              </text>
              {overall && (
                <text x="110" y="148" textAnchor="middle" fontSize="11" fill={colors.ink4} fontWeight="600">
                  of {fmtShort(overall.amount)}
                </text>
              )}
            </svg>
            <div style={{ fontSize: 12, color: colors.ink3, textAlign: 'center', lineHeight: 1.5, padding: '0 10px' }}>
              {overall ? (
                <>
                  {overallPct > 1 ? (
                    <>
                      Over by{' '}
                      <b style={{ color: '#A94646' }}>{fmtShort(overallSpent - overall.amount)}</b>.
                    </>
                  ) : (
                    <>
                      <b style={{ color: colors.accent }}>{fmtShort(overallRemaining)}</b> remaining {periodSuffix(overall.period)}.
                    </>
                  )}
                </>
              ) : (
                <>Tap "New budget" to set an overall monthly cap.</>
              )}
            </div>
          </div>

          {/* Per-category list */}
          <div style={styles.listCard}>
            {loading ? (
              <div style={styles.empty}>Loading…</div>
            ) : perCat.length === 0 ? (
              <div style={styles.empty}>
                No category budgets yet. Add one to track spending in a single area.
              </div>
            ) : (
              perCat.map((b, i) => {
                const tint = tintFor(b.name)
                const over = b.pct > 1
                const near = b.pct > 0.9 && !over
                const barColor = over ? '#A94646' : near ? colors.warn : cat[tint as CategoryTint].fg
                return (
                  <div
                    key={b.id}
                    style={{
                      padding: '16px 20px',
                      borderBottom: i === perCat.length - 1 ? 'none' : `0.5px solid ${colors.line}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Chip label={b.name} categoryName={b.name} />
                        <span style={{ fontSize: 11, color: colors.ink3, textTransform: 'capitalize' }}>{b.period}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <Money value={b.spent} currency={currency} locale={locale} size={16} serif={false} bold={700} />
                        <span style={{ color: colors.ink4, fontSize: 12, fontWeight: 600 }}>
                          of {fmtShort(b.cap)}
                        </span>
                        <span
                          style={{
                            color: over ? '#A94646' : near ? colors.warn : colors.ink3,
                            fontSize: 11,
                            fontWeight: 700,
                            marginLeft: 10,
                            background: over ? '#F4DDDD' : near ? colors.warnSoft : 'transparent',
                            padding: over || near ? '2px 7px' : 0,
                            borderRadius: 6,
                          }}
                        >
                          {over
                            ? `Over by ${fmtShort(b.spent - b.cap)}`
                            : near
                              ? 'Near limit'
                              : `${fmtShort(b.cap - b.spent)} left`}
                        </span>
                        <button onClick={() => handleRemove(b.id)} style={styles.removeBtn} title="Remove budget">
                          ×
                        </button>
                      </div>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: colors.surface2, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(b.pct, 1) * 100}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div
        style={{
          fontFamily: font.serif,
          fontSize: 24,
          fontWeight: 600,
          color,
          letterSpacing: -0.6,
        }}
      >
        {value}
      </div>
      <div
        style={{
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

function monthName(locale: string) {
  return new Date().toLocaleDateString(locale, { month: 'long' })
}

/** Title prefix for the page heading. Matches the overall budget's
 *  period so a weekly/quarterly user doesn't see "April budgets"
 *  for a window that has nothing to do with April. */
function periodTitle(period: BudgetPeriod, locale: string): string {
  switch (period) {
    case 'weekly':    return 'This week\'s'
    case 'biweekly':  return 'This fortnight\'s'
    case 'quarterly': return 'This quarter\'s'
    case 'yearly':    return 'This year\'s'
    default:          return monthName(locale)
  }
}

/** Body-copy suffix that follows "X of Y …" / "Z remaining …". */
function periodSuffix(period: BudgetPeriod): string {
  switch (period) {
    case 'weekly':    return 'this week'
    case 'biweekly':  return 'this fortnight'
    case 'quarterly': return 'this quarter'
    case 'yearly':    return 'this year'
    default:          return 'this month'
  }
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  formCard: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.xl,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  formTitle: { fontFamily: font.sans, fontWeight: 700, fontSize: 14, color: colors.ink },
  formRow: { display: 'flex', gap: 12 },
  field: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontFamily: font.sans, fontSize: 11, color: colors.ink3, fontWeight: 600 },
  input: {
    padding: '8px 12px',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink,
    outline: 'none',
    background: colors.surface2,
  },
  select: {
    padding: '8px 12px',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink,
    outline: 'none',
    background: colors.surface2,
  },
  cancelBtn: {
    padding: '8px 14px',
    background: 'transparent',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink2,
  },
  saveBtn: {
    padding: '8px 14px',
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
  },
  error: {
    padding: '8px 12px',
    background: '#F4DDDD',
    color: '#A94646',
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 12,
  },
  ringCard: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.xl,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.ink3,
    fontFamily: font.sans,
  },
  listCard: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: colors.ink4,
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0 4px',
    marginLeft: 8,
    lineHeight: 1,
  },
  empty: {
    padding: '40px 20px',
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    textAlign: 'center',
  },
}
