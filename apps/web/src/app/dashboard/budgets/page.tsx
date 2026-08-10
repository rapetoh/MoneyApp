'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Money } from '../../../components/Money'
import { Chip } from '../../../components/Chip'
import { Icon } from '../../../components/Icons'
import { ErrorState } from '../../../components/ErrorState'
import { useRealtime } from '../../../lib/useRealtime'
import type {
  BudgetPeriod,
  BudgetStatusRule,
  BudgetStatusTransaction,
  CategoryKind,
} from '@voice-expense/shared'
import { budgetStatus, localDay, categoryPalette } from '@voice-expense/shared'

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

type Cat = { id: string; name: string; kind: CategoryKind; color: string | null }
type Txn = {
  amount: number
  amount_in_profile_currency: number | null
  direction: 'debit' | 'credit'
  transacted_at: string
  category_id: string | null
  recurring_rule_id: string | null
}
type Budget = {
  id: string
  amount: number
  period: BudgetPeriod
  category_id: string | null
  currency_code: string
  starts_at: string
  is_active: boolean
}

export default function BudgetsPage() {
  const supabase = createClient()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [recurringRules, setRecurringRules] = useState<BudgetStatusRule[]>([])
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string; timezone?: string } | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [categoryId, setCategoryId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Read-error state, distinct from `error` above (which is the save-form's
  // own error) and distinct from "loaded, no active budget yet" (fix-plan
  // 2.13 / audit 08-F21 family).
  const [loadError, setLoadError] = useState<string | null>(null)
  // Drives the realtime subscriptions' filter below.
  const [userId, setUserId] = useState<string | null>(null)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const [b, t, c, r, p] = await Promise.all([
      supabase
        .from('budgets')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      // `amount_in_profile_currency` is required — `budgetStatus()` uses
      // it. `category_id`/`recurring_rule_id` are what scope a
      // per-category budget and dedupe an already-posted recurring
      // occurrence out of `committed` (fix-plan 2.5).
      supabase
        .from('transactions')
        .select('amount, amount_in_profile_currency, direction, transacted_at, category_id, recurring_rule_id')
        .eq('user_id', user.id)
        .eq('is_deleted', false),
      supabase.from('categories').select('id, name, kind, color').eq('user_id', user.id).eq('is_archived', false),
      // `budgetStatus()`'s `committed` figure — active debit rules due in
      // the window that haven't posted as a transaction yet.
      supabase.from('recurring_rules').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('profiles').select('currency_code, locale, timezone').eq('id', user.id).single(),
    ])
    const failure = b.error ?? t.error ?? c.error ?? r.error ?? p.error
    setLoadError(failure ? failure.message : null)
    if (!b.error) setBudgets((b.data ?? []) as Budget[])
    if (!t.error) setTransactions((t.data ?? []) as Txn[])
    if (!c.error) setCategories((c.data ?? []) as Cat[])
    if (!r.error) setRecurringRules((r.data ?? []) as BudgetStatusRule[])
    if (!p.error) setProfile(p.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  // Realtime — one shared hook per table, not a hand-rolled multi-table
  // effect (fix-plan 4.6). Without this, an expense logged on mobile
  // leaves the desktop Budgets ring stuck on stale numbers until the user
  // reloads the page (DESKTOP §4.4). All three stay unsubscribed until
  // `load()` above resolves `userId`.
  const realtimeFilter = userId ? `user_id=eq.${userId}` : null
  useRealtime('transactions', realtimeFilter, load)
  useRealtime('budgets', realtimeFilter, load)
  useRealtime('recurring_rules', realtimeFilter, load)

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

    // Deactivate the existing active budget in the same scope (overall,
    // or this category) — `.is('category_id', null)`, not
    // `.eq('category_id', null)`: PostgREST's `eq.null` never matches
    // `IS NULL`, so this deactivation was a silent no-op for every
    // overall budget and active rows accumulated across saves, with
    // three surfaces each picking a different one (audit 05-F5/05-F18).
    // Dropped the `.eq('period', period)` filter too — a new *any-*
    // period budget in this scope must retire whichever one is active
    // now, not just one with a matching period, or two periods'
    // budgets could both be active in the same scope at once. The
    // partial unique index in migration 026 makes this the database's
    // invariant, not just this code path's.
    let deactivate = supabase
      .from('budgets')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true)
    deactivate = categoryId ? deactivate.eq('category_id', categoryId) : deactivate.is('category_id', null)
    const { error: deactivateErr } = await deactivate
    if (deactivateErr) {
      setSaving(false)
      setError(deactivateErr.message)
      return
    }

    const tz = profile?.timezone || 'UTC'
    const { error: err } = await supabase.from('budgets').insert({
      user_id: user.id,
      client_id: crypto.randomUUID(),
      amount: parsed,
      period,
      category_id: categoryId || null,
      is_active: true,
      // `profile.currency_code`, not the schema default — a EUR
      // profile's budget was silently created as `'USD'` before this,
      // so `budgetStatus()` (which scopes by currency) never matched a
      // recurring rule against it (fix-plan 2.5).
      currency_code: currency,
      // Anchors a biweekly cycle's phase to the civil day the budget
      // was created on, in the profile's own zone, rather than
      // Postgres's server-date default (fix-plan 2.5).
      starts_at: localDay(new Date().toISOString(), tz),
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
    // Matches the transaction-delete confirm (transactions/page.tsx) —
    // this used to deactivate immediately on click, no confirmation and
    // no undo (audit 08-F49).
    if (!window.confirm('Remove this budget?')) return
    await supabase.from('budgets').update({ is_active: false }).eq('id', id)
    await load()
  }

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  // profiles.timezone (fix-plan 1.3 part 1) — every budget window on
  // this page comes from here, through `budgetStatus()`, never a
  // hand-rolled `new Date()` window with no end bound (audit 04-F9/
  // 05-F5/05-F17/05-F18).
  const tz = profile?.timezone || 'UTC'

  // `budgetStatus()`'s transaction shape needs `category_kind` to tell
  // a transfer (Savings & Investing) apart from ordinary spend — joined
  // in here from `categories`, same pattern as dashboard/page.tsx.
  const txnsForStatus: BudgetStatusTransaction[] = useMemo(
    () =>
      transactions.map((t) => ({
        ...t,
        category_kind: t.category_id ? catMap[t.category_id]?.kind ?? null : null,
      })),
    [transactions, catMap],
  )

  const overall = useMemo(() => {
    // Prefer a monthly overall — that's the default shape — but fall
    // back to any null-category budget the user set with a different
    // period (weekly, biweekly, quarterly, yearly).
    return budgets.find((b) => b.category_id === null && b.period === 'monthly') ?? budgets.find((b) => b.category_id === null)
  }, [budgets])

  // One shared implementation (`packages/shared/src/domain/budget.ts`,
  // fix-plan 2.5) for both the overall ring and every per-category row
  // below — replaces the old `periodStart()`, which had no end bound
  // (a future-dated transaction always counted against "now") and
  // ignored recurring rules entirely.
  const overallStatus = useMemo(() => {
    if (!overall) return null
    return budgetStatus(
      {
        period: overall.period,
        starts_at: overall.starts_at,
        category_id: null,
        currency_code: overall.currency_code,
        amount: overall.amount,
      },
      txnsForStatus,
      recurringRules,
      tz,
    )
  }, [overall, txnsForStatus, recurringRules, tz])

  const overallSpent = (overallStatus?.spent ?? 0) + (overallStatus?.committed ?? 0)
  const overallPct = overall ? Math.min(overallSpent / overall.amount, 1) : 0
  const overallRemaining = overall ? Math.max(0, overall.amount - overallSpent) : 0

  // Buckets by status for the per-category list
  const perCat = useMemo(() => {
    return budgets
      .filter((b) => b.category_id !== null)
      .map((b) => {
        const cName = b.category_id ? catMap[b.category_id]?.name ?? '—' : '—'
        // categories.color, not a name-regex guess (fix-plan 4.4) — this
        // is the same hex the category's own row/chip renders elsewhere,
        // so the budget bar can never disagree with it.
        const cColor = b.category_id ? catMap[b.category_id]?.color ?? null : null
        const status = budgetStatus(
          {
            period: b.period,
            starts_at: b.starts_at,
            category_id: b.category_id,
            currency_code: b.currency_code,
            amount: b.amount,
          },
          txnsForStatus,
          recurringRules,
          tz,
        )
        const spent = status.spent + status.committed
        const pct = spent / b.amount
        return { id: b.id, name: cName, color: cColor, period: b.period, cap: b.amount, spent, pct }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [budgets, txnsForStatus, recurringRules, tz, catMap])

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
                // Three labelled numbers (fix-plan 2.5) rather than one
                // silently-summed "spent" figure — `committed` (due
                // recurring rules that haven't posted yet, plus any
                // pre-logged future transaction) is real money that's
                // going to leave, but it isn't gone yet, so it gets its
                // own word instead of being folded invisibly into
                // "spent".
                <>
                  <b style={{ color: colors.ink }}>{fmtShort(overallStatus?.spent ?? 0)}</b> spent
                  {(overallStatus?.committed ?? 0) > 0 && (
                    <>
                      {' '}
                      · <b style={{ color: colors.ink }}>{fmtShort(overallStatus!.committed)}</b> committed
                    </>
                  )}
                  {' '}· <b style={{ color: colors.ink }}>{fmtShort(overall.amount)}</b> cap {periodSuffix(overall.period)}.
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
              {/* Gated behind `overall` (fix-plan 2.5's "Done when": the
                  Budgets page with zero budgets renders no currency figure
                  inside the ring) — an unlabelled figure here previously
                  rendered even with no budget set, under the caption
                  "spent this month", which is exactly the ambiguous
                  bare-number-in-a-money-app shape this item removes. */}
              {overall && (
                <>
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
                  <text x="110" y="148" textAnchor="middle" fontSize="11" fill={colors.ink4} fontWeight="600">
                    of {fmtShort(overall.amount)}
                  </text>
                </>
              )}
            </svg>
            <div style={{ fontSize: 12, color: colors.ink3, textAlign: 'center', lineHeight: 1.5, padding: '0 10px' }}>
              {loadError ? (
                // Distinct from "no overall budget set yet" (fix-plan 2.13 /
                // audit 08-F21) — a failed read must not read as an
                // invitation to set a budget that may already exist.
                <span style={{ color: colors.destructive, fontWeight: 600 }}>Couldn't load your budget.</span>
              ) : overall ? (
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
            ) : loadError ? (
              <ErrorState message="We couldn't load your budgets." detail={loadError} onRetry={load} />
            ) : perCat.length === 0 ? (
              <div style={styles.empty}>
                No category budgets yet. Add one to track spending in a single area.
              </div>
            ) : (
              perCat.map((b, i) => {
                const over = b.pct > 1
                const near = b.pct > 0.9 && !over
                const barColor = over
                  ? '#A94646'
                  : near
                    ? colors.warn
                    : b.color
                      ? categoryPalette(b.color).fg
                      : colors.ink3
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
                        <Chip label={b.name} categoryColor={b.color} />
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
