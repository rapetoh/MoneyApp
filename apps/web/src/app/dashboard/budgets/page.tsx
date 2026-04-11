'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../../lib/theme'
import { formatCurrency } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'

const PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

function periodSpend(period: BudgetPeriod, transactions: any[]): number {
  const now = new Date()
  let start: Date
  if (period === 'weekly') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    start = new Date(now)
    start.setDate(now.getDate() - diff)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'biweekly') {
    start = new Date(now)
    start.setDate(now.getDate() - 13)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3)
    start = new Date(now.getFullYear(), q * 3, 1)
  } else if (period === 'yearly') {
    start = new Date(now.getFullYear(), 0, 1)
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return transactions
    .filter((t) => t.direction === 'debit' && new Date(t.transacted_at) >= start)
    .reduce((s, t) => s + t.amount, 0)
}

export default function BudgetsPage() {
  const supabase = createClient()
  const [budgets, setBudgets] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [b, t, p] = await Promise.all([
      supabase.from('budgets').select('*').eq('user_id', user.id).eq('is_active', true).is('category_id', null).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('user_id', user.id).eq('is_deleted', false),
      supabase.from('profiles').select('*').eq('id', user.id).single(),
    ])
    setBudgets(b.data ?? [])
    setTransactions(t.data ?? [])
    setProfile(p.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Deactivate existing
    await supabase.from('budgets').update({ is_active: false }).eq('user_id', user.id).eq('is_active', true).is('category_id', null)

    const { error: err } = await supabase.from('budgets').insert({
      user_id: user.id,
      amount: parsed,
      period,
      currency_code: profile?.currency_code ?? 'USD',
      category_id: null,
      is_active: true,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    setAmount('')
    await load()
  }

  async function handleDeactivate(id: string) {
    await supabase.from('budgets').update({ is_active: false }).eq('id', id)
    await load()
  }

  const currency = profile?.currency_code ?? 'USD'

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Budgets</h1>
          <p style={styles.subtitle}>Track your spending limits</p>
        </div>
        <button onClick={() => setShowForm(true)} style={styles.newBtn}>+ New Budget</button>
      </div>

      {/* New budget form */}
      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>Set Budget</h3>
          {error && <div style={styles.errorBox}>{error}</div>}
          <div style={styles.formRow}>
            <div style={styles.field}>
              <label style={styles.label}>Amount ({currency})</label>
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" style={styles.input} autoFocus />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)} style={styles.select}>
                {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div style={styles.formActions}>
            <button onClick={() => { setShowForm(false); setError(null) }} style={styles.cancelBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>{saving ? 'Saving…' : 'Save Budget'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : budgets.length === 0 ? (
        <div style={styles.emptyCard}>
          <p style={styles.emptyText}>No active budgets. Create one to start tracking.</p>
        </div>
      ) : (
        <div style={styles.budgetList}>
          {budgets.map((b) => {
            const spent = periodSpend(b.period, transactions)
            const pct = Math.min(100, (spent / b.amount) * 100)
            const over = spent > b.amount
            const periodLabel = PERIODS.find((p) => p.value === b.period)?.label ?? b.period
            return (
              <div key={b.id} style={styles.budgetCard}>
                <div style={styles.budgetHeader}>
                  <div>
                    <span style={styles.budgetLabel}>{periodLabel} Budget</span>
                    <span style={styles.budgetAmount}>{formatCurrency(b.amount, currency)}</span>
                  </div>
                  <button onClick={() => handleDeactivate(b.id)} style={styles.deactivateBtn}>Remove</button>
                </div>
                <div style={styles.progressTrack}>
                  <div style={{ ...styles.progressFill, width: `${pct}%`, background: over ? colors.destructive : pct > 80 ? '#F48C06' : colors.primary }} />
                </div>
                <div style={styles.budgetFooter}>
                  <span style={{ color: over ? colors.destructive : colors.textSecondary }}>
                    {over ? `Over by ${formatCurrency(spent - b.amount, currency)}` : `${formatCurrency(spent, currency)} spent`}
                  </span>
                  <span style={{ color: colors.textSecondary }}>
                    {formatCurrency(Math.max(0, b.amount - spent), currency)} remaining
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: spacing['2xl'], display: 'flex', flexDirection: 'column', gap: spacing.xl, maxWidth: 800 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize['3xl'], color: colors.text },
  subtitle: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  newBtn: { background: colors.primary, color: colors.white, border: 'none', borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.base}px`, fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm },
  formCard: { background: colors.card, borderRadius: radius.lg, padding: spacing.xl, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, display: 'flex', flexDirection: 'column', gap: spacing.base },
  formTitle: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize.lg, color: colors.text },
  formRow: { display: 'flex', gap: spacing.base },
  field: { flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.xs },
  label: { fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm, color: colors.text },
  input: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.mono, fontSize: fontSize.base, color: colors.text, background: colors.background, outline: 'none' },
  select: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.base, color: colors.text, background: colors.background, outline: 'none' },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: spacing.sm },
  cancelBtn: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.base}px`, fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm, color: colors.textSecondary, background: colors.card },
  saveBtn: { background: colors.primary, color: colors.white, border: 'none', borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.base}px`, fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm },
  errorBox: { background: colors.destructiveLight, border: `1px solid ${colors.destructive}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontSize: fontSize.sm, color: colors.destructive },
  budgetList: { display: 'flex', flexDirection: 'column', gap: spacing.base },
  budgetCard: { background: colors.card, borderRadius: radius.lg, padding: spacing.xl, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, display: 'flex', flexDirection: 'column', gap: spacing.md },
  budgetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  budgetLabel: { display: 'block', fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  budgetAmount: { display: 'block', fontFamily: font.mono, fontWeight: 700, fontSize: fontSize['2xl'], color: colors.text },
  deactivateBtn: { border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: `${spacing.xs}px ${spacing.sm}px`, fontFamily: font.sans, fontSize: fontSize.xs, color: colors.textSecondary, background: 'transparent' },
  progressTrack: { height: 8, background: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.full, transition: 'width 0.3s' },
  budgetFooter: { display: 'flex', justifyContent: 'space-between', fontFamily: font.sans, fontSize: fontSize.sm },
  empty: { padding: spacing['3xl'], textAlign: 'center' as const, fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textMuted },
  emptyCard: { background: colors.card, borderRadius: radius.lg, padding: spacing['3xl'], border: `1px solid ${colors.border}`, textAlign: 'center' as const },
  emptyText: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textMuted },
}
