'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Icon } from '../../../components/Icons'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS']
const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Fran\u00e7ais' },
  { value: 'es', label: 'Espa\u00f1ol' },
  { value: 'pt', label: 'Portugu\u00eas' },
]

type SectionKey =
  | 'account'
  | 'sync'
  | 'plan'
  | 'privacy'
  | 'voice'
  | 'export'
  | 'about'

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'account', label: 'Account' },
  { key: 'sync', label: 'Sync & devices' },
  { key: 'plan', label: 'Plan & billing' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'voice', label: 'Voice & language' },
  { key: 'export', label: 'Export' },
  { key: 'about', label: 'About' },
]

export default function SettingsPage() {
  const supabase = createClient()
  const [profile, setProfile] = useState<{
    id?: string
    display_name?: string | null
    currency_code?: string
    locale?: string
    monthly_income?: number | null
  } | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [active, setActive] = useState<SectionKey>('account')

  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [locale, setLocale] = useState('en')

  // Anonymous-analytics + crash-reporting toggles — UI only for now;
  // they don't yet wire to a backing setting on web.
  const [analyticsOn, setAnalyticsOn] = useState(false)
  const [crashReportingOn, setCrashReportingOn] = useState(true)

  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    account: null,
    sync: null,
    plan: null,
    privacy: null,
    voice: null,
    export: null,
    about: null,
  })

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? null)
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

  function pickSection(k: SectionKey) {
    setActive(k)
    const el = sectionRefs.current[k]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        currency_code: currency,
        locale,
      })
      .eq('id', user.id)
    setSaving(false)
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  const initial = (displayName || email || 'U').trim()[0]?.toUpperCase() ?? 'U'
  const isPlus = process.env.NODE_ENV !== 'production'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar title="Settings" />
      <div style={styles.page}>
        <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
          Settings
        </div>

        <div style={styles.layout}>
          {/* Sub-nav */}
          <div style={styles.subNav}>
            {SECTIONS.map((s) => {
              const on = active === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => pickSection(s.key)}
                  style={{
                    ...styles.subNavItem,
                    background: on ? colors.surface2 : 'transparent',
                    color: on ? colors.ink : colors.ink2,
                  }}
                >
                  {s.label}
                </button>
              )
            })}
            <div style={{ height: 16 }} />
            <button onClick={handleSignOut} style={styles.signOutItem} type="button">
              <Icon.signOut color={colors.ink3} size={14} />
              Sign out
            </button>
          </div>

          {/* Right column — stacked section cards. The sub-nav scrolls
              between them. */}
          <div style={styles.cardsCol}>
            <SettingsCard
              title="Account"
              refCb={(el) => (sectionRefs.current.account = el)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    background: 'linear-gradient(135deg, #3F5A3E, #6B8A6A)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: font.display,
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {initial}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: colors.ink }}>
                    {displayName || 'Set your name'}
                  </div>
                  <div style={{ fontSize: 12, color: colors.ink3, marginTop: 2 }}>
                    {email ?? 'Signed in'}
                  </div>
                </div>
              </div>
              <form onSubmit={handleSaveAccount} style={styles.form}>
                <div style={styles.field}>
                  <label style={styles.label}>Display name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    style={styles.input}
                  />
                </div>
                <div style={styles.formRow}>
                  <div style={{ ...styles.field, flex: 1 }}>
                    <label style={styles.label}>Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={styles.select}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ ...styles.field, flex: 1 }}>
                    <label style={styles.label}>Language</label>
                    <select value={locale} onChange={(e) => setLocale(e.target.value)} style={styles.select}>
                      {LOCALES.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={styles.actions}>
                  {success && <span style={styles.successMsg}>Saved.</span>}
                  <button type="submit" disabled={saving || loading} style={styles.saveBtn}>
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
            </SettingsCard>

            <SettingsCard
              title="Sync & devices"
              refCb={(el) => (sectionRefs.current.sync = el)}
            >
              <SettingRow
                label="This device"
                sub="Synced just now · web companion"
                right={<Tag color={colors.accent} bg={colors.accentSoft}>THIS DEVICE</Tag>}
              />
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  background: colors.accentSoft,
                  borderRadius: 10,
                  fontSize: 12,
                  color: colors.accent,
                  fontWeight: 600,
                  fontFamily: font.sans,
                }}
              >
                End-to-end encrypted via your account. Murmur servers never see your transactions in plaintext.
              </div>
            </SettingsCard>

            <SettingsCard
              title="Plan & billing"
              refCb={(el) => (sectionRefs.current.plan = el)}
              right={
                isPlus ? (
                  <Tag color={colors.accent} bg={colors.accentSoft}>ACTIVE</Tag>
                ) : (
                  <Tag color="#7A4A22" bg="#F2E5D5">FREE</Tag>
                )
              }
            >
              <SettingRow
                label={isPlus ? 'Murmur Plus · Yearly' : 'Mobile app'}
                sub={
                  isPlus
                    ? 'Renews on your billing date · cancel anytime'
                    : 'Free forever · no trial, no upsells'
                }
                right={
                  isPlus ? (
                    <span style={styles.linkBtn}>Manage</span>
                  ) : (
                    <span style={{ fontSize: 12, color: colors.ink3, fontWeight: 600 }}>Always</span>
                  )
                }
              />
              {!isPlus && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 12,
                    background: colors.surface2,
                    borderRadius: 10,
                    fontSize: 12,
                    color: colors.ink2,
                    lineHeight: 1.5,
                    fontFamily: font.sans,
                  }}
                >
                  Murmur Plus unlocks Reports & forecast, Ask Murmur, recurring detection, and full export.
                </div>
              )}
            </SettingsCard>

            <SettingsCard
              title="Privacy"
              refCb={(el) => (sectionRefs.current.privacy = el)}
              right={<Tag color={colors.accent} bg={colors.accentSoft}>ON-DEVICE</Tag>}
            >
              <SettingToggle
                label="Anonymous usage analytics"
                sub="Help us improve. No transaction data sent."
                on={analyticsOn}
                onToggle={() => setAnalyticsOn((v) => !v)}
              />
              <SettingToggle
                label="Crash reporting"
                sub="Sends crash logs only — no personal data."
                on={crashReportingOn}
                onToggle={() => setCrashReportingOn((v) => !v)}
              />
            </SettingsCard>

            <SettingsCard
              title="Voice & language"
              refCb={(el) => (sectionRefs.current.voice = el)}
            >
              <SettingRow
                label="Voice engine"
                sub="On-device (mobile)"
                right={<Tag color={colors.accent} bg={colors.accentSoft}>ON-DEVICE</Tag>}
              />
              <SettingRow
                label="Recognition language"
                sub="Used by the mic in Ask Murmur and the mobile capture flow."
                right={<span style={{ fontSize: 13, color: colors.ink2, fontWeight: 600 }}>{locale.toUpperCase()}</span>}
              />
            </SettingsCard>

            <SettingsCard
              title="Export"
              refCb={(el) => (sectionRefs.current.export = el)}
            >
              <SettingRow
                label="Export all transactions"
                sub="CSV · JSON · PDF"
                right={
                  <Link href="/dashboard/export" style={styles.linkBtn}>
                    Open
                  </Link>
                }
              />
            </SettingsCard>

            <SettingsCard
              title="About"
              refCb={(el) => (sectionRefs.current.about = el)}
            >
              <SettingRow
                label="Version"
                sub="Murmur · desktop companion"
                right={
                  <span style={{ fontFamily: font.mono, fontSize: 12, color: colors.ink3 }}>
                    {process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'}
                  </span>
                }
              />
              <SettingRow
                label="Help & contact"
                sub="hello@murmur.app"
                right={
                  <a
                    href="mailto:hello@murmur.app"
                    style={styles.linkBtn}
                  >
                    Email
                  </a>
                }
              />
            </SettingsCard>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsCard({
  title,
  right,
  children,
  refCb,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
  refCb?: (el: HTMLDivElement | null) => void
}) {
  return (
    <div ref={refCb} style={styles.sectionCard}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle}>{title}</div>
        {right}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

function SettingRow({
  label,
  sub,
  right,
}: {
  label: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, fontFamily: font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: colors.ink3, marginTop: 2, fontFamily: font.sans }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function SettingToggle({
  label,
  sub,
  on,
  onToggle,
}: {
  label: string
  sub?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.ink, fontFamily: font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: colors.ink3, marginTop: 2, fontFamily: font.sans }}>{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          background: on ? colors.accent : '#D8D5CC',
          border: 'none',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 120ms',
        }}
        aria-pressed={on}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            transition: 'left 120ms',
          }}
        />
      </button>
    </div>
  )
}

function Tag({
  children,
  color,
  bg,
}: {
  children: React.ReactNode
  color: string
  bg: string
}) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        padding: '3px 8px',
        borderRadius: 6,
        letterSpacing: 0.4,
        fontFamily: font.sans,
      }}
    >
      {children}
    </span>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: '0 20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr',
    gap: 20,
    alignItems: 'flex-start',
  },
  subNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    position: 'sticky',
    top: 16,
  },
  subNavItem: {
    padding: '8px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    fontFamily: font.sans,
    textAlign: 'left' as const,
  },
  signOutItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    background: 'transparent',
    border: `0.5px solid ${colors.line}`,
    borderRadius: 8,
    color: colors.ink2,
    fontFamily: font.sans,
    cursor: 'pointer',
  },
  cardsCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionCard: {
    background: colors.card,
    borderRadius: 16,
    border: `0.5px solid ${colors.line}`,
    padding: '18px 20px',
    fontFamily: font.sans,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.ink,
    letterSpacing: -0.2,
    fontFamily: font.sans,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 14,
  },
  formRow: { display: 'flex', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: colors.ink3,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    fontFamily: font.sans,
  },
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
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
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
    cursor: 'pointer',
  },
  successMsg: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.accent,
    fontWeight: 600,
  },
  linkBtn: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: 700,
    textDecoration: 'none',
    fontFamily: font.sans,
    cursor: 'pointer',
  },
}
