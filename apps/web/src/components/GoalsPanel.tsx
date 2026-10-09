'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '../lib/supabase/client'
import { colors, font, radius } from '../lib/theme'
import { useRealtime } from '../lib/useRealtime'
import { Money } from './Money'
import { goalStatus, formatMoney, localDay, type Database, type GoalPace } from '@voice-expense/shared'

type Goal = Database['public']['Tables']['savings_goals']['Row']
type Contribution = Database['public']['Tables']['goal_contributions']['Row']

const PACE: Record<GoalPace, { label: string; warn: boolean } | null> = {
  done: { label: 'Reached', warn: false },
  ahead: { label: 'Ahead', warn: false },
  on_track: { label: 'On track', warn: false },
  behind: { label: 'Behind', warn: true },
  overdue: { label: 'Past date', warn: true },
  no_date: null,
}

/**
 * Savings goals on the web Budgets page (migration 042, Oct 2026), the same
 * goals and the same math (`goalStatus`) as the phone's Budgets tab.
 */
export function GoalsPanel({ userId, currency, locale, tz }: { userId: string | null; currency: string; locale: string; tz: string }) {
  const supabase = createClient()
  const [goals, setGoals] = useState<Goal[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ id: string | null; name: string; amount: string; date: string } | null>(null)
  const [money, setMoney] = useState<{ goal: Goal; amount: string; out: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    const [g, c] = await Promise.all([
      supabase.from('savings_goals').select('*').eq('user_id', userId).is('archived_at', null).order('created_at'),
      supabase.from('goal_contributions').select('*').eq('user_id', userId).order('contributed_at'),
    ])
    if (g.error || c.error) {
      setError((g.error ?? c.error)!.message)
      return
    }
    setError(null)
    setGoals((g.data ?? []) as Goal[])
    setContributions((c.data ?? []) as Contribution[])
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const filter = userId ? `user_id=eq.${userId}` : null
  useRealtime('savings_goals', filter, load)
  useRealtime('goal_contributions', filter, load)

  const rows = useMemo(
    () => goals.map((g) => ({ goal: g, status: goalStatus(g, contributions.filter((c) => c.goal_id === g.id), tz) })),
    [goals, contributions, tz],
  )

  const fmt = (n: number, code = currency) => formatMoney(n, code, locale, { precision: 'whole' })

  async function saveGoal() {
    if (!form || !userId) return
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('Enter a name and a target above zero')
      return
    }
    setBusy(true)
    const fields = {
      name: form.name.trim().slice(0, 80),
      target_amount: Math.round(amount * 100) / 100,
      target_date: form.date || null,
    }
    const { error: e } = form.id
      ? await supabase.from('savings_goals').update(fields).eq('id', form.id).eq('user_id', userId)
      : await supabase.from('savings_goals').insert({ ...fields, user_id: userId, currency_code: currency })
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    setForm(null)
    await load()
  }

  async function saveMoney() {
    if (!money || !userId) return
    const amount = parseFloat(money.amount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount above zero')
      return
    }
    setBusy(true)
    const value = Math.round(amount * 100) / 100
    const { error: e } = await supabase
      .from('goal_contributions')
      .insert({ goal_id: money.goal.id, user_id: userId, amount: money.out ? -value : value })
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    setMoney(null)
    await load()
  }

  async function removeGoal(goal: Goal) {
    if (!userId || !window.confirm(`Remove "${goal.name}"?`)) return
    await supabase.from('savings_goals').update({ archived_at: new Date().toISOString() }).eq('id', goal.id).eq('user_id', userId)
    await load()
  }

  return (
    <div style={s.card}>
      <div style={s.head}>
        <div style={s.eyebrow}>Savings goals</div>
        <button style={s.linkBtn} onClick={() => setForm({ id: null, name: '', amount: '', date: '' })}>
          + New goal
        </button>
      </div>
      {error && <div style={s.error}>{error}</div>}

      {form && (
        <div style={s.form}>
          <input style={{ ...s.input, flex: 2 }} placeholder="What are you saving for?" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          <input style={s.input} type="number" placeholder="Target" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input style={s.input} type="date" min={localDay(new Date().toISOString(), tz)} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} title="Target date (optional)" />
          <button style={s.ghostBtn} onClick={() => setForm(null)}>Cancel</button>
          <button style={s.primaryBtn} disabled={busy} onClick={saveGoal}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}

      {rows.length === 0 && !form ? (
        <div style={s.empty}>Saving for something? Set a goal and track what you put aside.</div>
      ) : (
        rows.map(({ goal, status }, i) => {
          const pace = PACE[status.pace]
          return (
            <div key={goal.id} style={{ ...s.row, borderTop: i === 0 ? 'none' : `0.5px solid ${colors.line}` }}>
              <div style={s.rowTop}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={s.name}>{goal.name}</span>
                  {pace && <span style={{ ...s.pill, ...(pace.warn ? s.pillWarn : {}) }}>{pace.label}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <Money value={status.saved} currency={goal.currency_code} locale={locale} size={16} serif={false} bold={700} />
                  <span style={{ color: colors.ink4, fontSize: 12, fontWeight: 600 }}>of {fmt(goal.target_amount, goal.currency_code)}</span>
                </div>
              </div>
              <div style={s.track}>
                <div style={{ ...s.fill, width: `${status.pct * 100}%` }} />
              </div>
              <div style={s.rowBottom}>
                <span style={s.caption}>
                  {status.pace === 'done'
                    ? 'Goal reached.'
                    : status.pace === 'overdue'
                      ? 'The date has passed. Keep going or pick a new date.'
                      : status.perMonth != null && goal.target_date
                        ? `${fmt(status.perMonth, goal.currency_code)} a month to finish by ${monthYear(goal.target_date, locale)}`
                        : `${fmt(status.remaining, goal.currency_code)} to go`}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button style={s.smallBtn} onClick={() => setMoney({ goal, amount: '', out: false })}>Add money</button>
                  <button style={s.smallBtn} onClick={() => setMoney({ goal, amount: '', out: true })}>Take out</button>
                  <button style={s.smallBtn} onClick={() => setForm({ id: goal.id, name: goal.name, amount: String(goal.target_amount), date: goal.target_date ?? '' })}>Edit</button>
                  <button style={s.removeBtn} title="Remove goal" onClick={() => removeGoal(goal)}>×</button>
                </span>
              </div>
              {money?.goal.id === goal.id && (
                <div style={{ ...s.form, marginTop: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: colors.ink3 }}>{money.out ? 'Take out' : 'Add money'}</span>
                  <input style={s.input} type="number" placeholder="Amount" value={money.amount} onChange={(e) => setMoney({ ...money, amount: e.target.value })} autoFocus />
                  <button style={s.ghostBtn} onClick={() => setMoney(null)}>Cancel</button>
                  <button style={s.primaryBtn} disabled={busy} onClick={saveMoney}>{busy ? 'Saving…' : 'Save'}</button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

/** "Apr 2027" for a stored civil day, as the phone shows it. */
function monthYear(day: string, locale: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

const s: Record<string, React.CSSProperties> = {
  card: { background: colors.card, border: `0.5px solid ${colors.line}`, borderRadius: radius.xl, padding: 20, fontFamily: font.sans },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.ink3 },
  linkBtn: { background: 'none', border: 'none', color: colors.accent, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: font.sans },
  empty: { fontSize: 13, color: colors.ink3, padding: '10px 0' },
  error: { padding: '8px 12px', background: '#F4DDDD', color: '#A94646', borderRadius: radius.md, fontSize: 12, marginBottom: 8 },
  form: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 0 10px' },
  input: { flex: 1, minWidth: 120, padding: '8px 12px', border: `0.5px solid ${colors.line}`, borderRadius: radius.md, fontFamily: font.sans, fontSize: 13, color: colors.ink, outline: 'none', background: colors.surface2 },
  primaryBtn: { padding: '8px 14px', background: colors.accent, color: '#fff', border: 'none', borderRadius: radius.md, fontFamily: font.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  ghostBtn: { padding: '8px 14px', background: 'transparent', border: `0.5px solid ${colors.line}`, borderRadius: radius.md, fontFamily: font.sans, fontSize: 13, fontWeight: 600, color: colors.ink2, cursor: 'pointer' },
  row: { padding: '14px 0' },
  rowTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  name: { fontWeight: 600, fontSize: 14, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pill: { fontSize: 11, fontWeight: 700, color: colors.accent, background: colors.accentSoft, padding: '2px 7px', borderRadius: 6 },
  pillWarn: { color: '#9A6B12', background: '#F6ECD9' },
  track: { height: 8, borderRadius: 4, background: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', background: colors.accent, borderRadius: 4 },
  rowBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  caption: { fontSize: 12, color: colors.ink3 },
  smallBtn: { padding: '4px 10px', background: colors.surface2, border: `0.5px solid ${colors.line}`, borderRadius: radius.md, fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: colors.ink2, cursor: 'pointer' },
  removeBtn: { background: 'none', border: 'none', color: colors.ink4, fontSize: 16, cursor: 'pointer', padding: '0 4px' },
}
