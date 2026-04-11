'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, fontSize, spacing, radius } from '../../../lib/theme'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS']
const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [locale, setLocale] = useState('en')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        setProfile(data)
        setDisplayName(data.display_name ?? '')
        setCurrency(data.currency_code ?? 'USD')
        setLocale(data.locale ?? 'en')
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({
      display_name: displayName.trim() || null,
      currency_code: currency,
      locale,
    }).eq('id', user.id)
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  if (loading) return <div style={{ padding: spacing['2xl'], fontFamily: font.sans, color: colors.textMuted }}>Loading…</div>

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Settings</h1>
      <p style={styles.subtitle}>Manage your profile and preferences</p>

      <form onSubmit={handleSave} style={styles.card}>
        <h2 style={styles.cardTitle}>Profile</h2>

        <div style={styles.field}>
          <label style={styles.label}>Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            style={styles.input}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={styles.select}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p style={styles.hint}>All amounts in the app will display in this currency.</p>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Language</label>
          <select value={locale} onChange={(e) => setLocale(e.target.value)} style={styles.select}>
            {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>

        <div style={styles.actions}>
          {success && <span style={styles.successMsg}>Saved successfully</span>}
          <button type="submit" disabled={saving} style={styles.saveBtn}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: spacing['2xl'], display: 'flex', flexDirection: 'column', gap: spacing.xl, maxWidth: 600 },
  title: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize['3xl'], color: colors.text },
  subtitle: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: -spacing.md },
  card: { background: colors.card, borderRadius: radius.lg, padding: spacing.xl, border: `1px solid ${colors.border}`, boxShadow: `0 2px 8px ${colors.shadow}`, display: 'flex', flexDirection: 'column', gap: spacing.xl },
  cardTitle: { fontFamily: font.sans, fontWeight: 700, fontSize: fontSize.lg, color: colors.text },
  field: { display: 'flex', flexDirection: 'column', gap: spacing.xs },
  label: { fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.sm, color: colors.text },
  input: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.base, color: colors.text, background: colors.background, outline: 'none' },
  select: { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px`, fontFamily: font.sans, fontSize: fontSize.base, color: colors.text, background: colors.background, outline: 'none' },
  hint: { fontFamily: font.sans, fontSize: fontSize.xs, color: colors.textMuted },
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  saveBtn: { background: colors.primary, color: colors.white, border: 'none', borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.xl}px`, fontFamily: font.sans, fontWeight: 600, fontSize: fontSize.base },
  successMsg: { fontFamily: font.sans, fontSize: fontSize.sm, color: colors.income, fontWeight: 600 },
}
