'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Icon } from '../../../components/Icons'
import { ErrorState } from '../../../components/ErrorState'
import { usePlus } from '../../../lib/plus'
import { PlusRefreshButton } from '../../../components/PlusRefreshButton'
import { changeCurrency } from '../../../lib/changeCurrency'
import { formatRelativeSync } from '../../../lib/relativeTime'
import { SUPPORT_EMAIL, SUPPORT_MAILTO, describePlus, PLUS_MANAGE_URL_APPLE, type Profile } from '@voice-expense/shared'

/** `devices.platform` -> a human label (fix-plan 3.7's real device rows). */
function platformLabel(platform: string): string {
  switch (platform) {
    case 'ios': return 'iPhone'
    case 'android': return 'Android'
    case 'web': return 'Web'
    case 'desktop_mac': return 'Mac'
    case 'desktop_win': return 'Windows'
    default: return platform
  }
}

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
    timezone?: string | null
    voice_language?: string | null
    plus_status?: 'active' | 'lapsed' | 'free' | null
    plus_product_id?: string | null
    plus_period_type?: 'trial' | 'intro' | 'normal' | null
    plus_expires_at?: string | null
    plus_will_renew?: boolean | null
    plus_synced_at?: string | null
  } | null>(null)
  // Fix-plan 3.7: real rows from `devices` (populated by mobile's
  // `deviceRegistry.ts`) instead of one hardcoded "This device · Synced
  // just now · web companion" row — web itself never registers a device
  // (it has no offline outbox to report sync state for), so this list is
  // "devices this account has signed into", which for most users today
  // means their phone.
  const [devices, setDevices] = useState<
    Array<{ id: string; platform: string; device_name: string | null; last_synced_at: string | null }>
  >([])
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Read-error state (fix-plan 2.13 / audit 08-F21 family). This page had
  // no loading/empty gate at all — a failed profile read left every field
  // showing its blank/default value (no name, USD, English),
  // indistinguishable from "brand-new account, nothing saved yet." The
  // *save* path's own error surfacing (the unconditional green "Saved."
  // bug) is a separate, write-path fix outside this item's read-only
  // scope; this is the read path only, named `loadError` to keep both
  // states distinct wherever both eventually exist on this page.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  // Write-path error state for `handleSaveAccount` (fix-plan 2.13 /
  // audit 08-F21 family) — distinct from `loadError` above. Also used
  // for the session-expired case: the old `if (!user) return` left
  // `saving` stuck `true` forever with no explanation.
  const [saveError, setSaveError] = useState<string | null>(null)
  const [active, setActive] = useState<SectionKey>('account')

  const [displayName, setDisplayName] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [locale, setLocale] = useState('en')
  // Currency-change flow (fix-plan 2.7, audit 05-F13/06-F8/08-F5) —
  // mirrors `apps/mobile/app/more/settings.tsx`'s confirm/refuse
  // contract. `txnCount` backs the confirmation copy ("this will
  // reconvert N transactions"); `currencyConverting` blocks the picker
  // while the batched Edge Function call is in flight; `currencyProgress`
  // is `null` until the first batch reports back.
  const [txnCount, setTxnCount] = useState(0)
  const [currencyConverting, setCurrencyConverting] = useState(false)
  const [currencyProgress, setCurrencyProgress] = useState<{ converted: number; total: number } | null>(
    null,
  )
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  // Stored as a string so the input behaves like a normal text field
  // (empty allowed, no spinner artifacts). Parsed on save — empty
  // string saves null so the user can clear their income.
  const [monthlyIncomeInput, setMonthlyIncomeInput] = useState('')

  const [deleting, setDeleting] = useState(false)

  // Unsaved-changes guard for the Account form (audit 08-F49) — this used
  // to have none at all; navigating away silently discarded edits. Baseline
  // is the last value the form was loaded or saved *to*, not `profile`
  // itself, so a mid-edit save immediately clears the dirty flag rather
  // than waiting on a re-fetch.
  const savedFormRef = useRef({ displayName: '', locale: 'en', monthlyIncomeInput: '' })
  const isAccountFormDirty =
    displayName !== savedFormRef.current.displayName ||
    locale !== savedFormRef.current.locale ||
    monthlyIncomeInput !== savedFormRef.current.monthlyIncomeInput

  useEffect(() => {
    if (!isAccountFormDirty) return
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    // In-app navigation (Sidebar/Toolbar links) doesn't trigger
    // `beforeunload` under the App Router's client-side routing — a
    // capturing click listener on any same-origin `<a>` is the
    // route-change half of the guard.
    function handleClickCapture(e: MouseEvent) {
      const anchor = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      let url: URL
      try {
        url = new URL(anchor.href, window.location.origin)
      } catch {
        return
      }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return
      if (!window.confirm('You have unsaved changes. Leave without saving?')) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleClickCapture, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClickCapture, true)
    }
  }, [isAccountFormDirty])

  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    account: null,
    sync: null,
    plan: null,
    privacy: null,
    voice: null,
    export: null,
    about: null,
  })

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    setEmail(user.email ?? null)
    const [{ data, error }, countResult, deviceResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_deleted', false),
      supabase
        .from('devices')
        .select('id, platform, device_name, last_synced_at')
        .eq('user_id', user.id)
        .order('last_synced_at', { ascending: false, nullsFirst: false }),
    ])
    setTxnCount(countResult.count ?? 0)
    setDevices(deviceResult.data ?? [])
    if (error) {
      setLoadError(error.message)
    } else if (data) {
      setLoadError(null)
      // `plus_status` / `plus_period_type` carry CHECK constraints the
      // generated Row type can't see (same narrowing as
      // packages/shared/src/types/profile.ts).
      setProfile(data as Profile)
      const loadedDisplayName = data.display_name ?? ''
      const loadedLocale = data.locale ?? 'en'
      const loadedMonthlyIncomeInput = data.monthly_income != null ? String(data.monthly_income) : ''
      setDisplayName(loadedDisplayName)
      setCurrency(data.currency_code ?? 'USD')
      setLocale(loadedLocale)
      setMonthlyIncomeInput(loadedMonthlyIncomeInput)
      savedFormRef.current = {
        displayName: loadedDisplayName,
        locale: loadedLocale,
        monthlyIncomeInput: loadedMonthlyIncomeInput,
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // GDPR right to erasure. Calls the server-side `delete-user` Edge
  // Function (only path that can also remove the auth.users row), then
  // signs out. Confirmation gate is a native `confirm()` — the page is
  // small enough that wiring a full modal would be overkill, and the
  // string sets the stakes clearly. If the user accidentally clicks
  // away, nothing happens.
  async function handleDeleteAll() {
    if (deleting) return
    const confirmed = window.confirm(
      'Delete everything permanently?\n\nWe will remove every transaction, budget, recurring rule, category, and Ask conversation from your account, then sign you out. This cannot be undone.',
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-user`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      await supabase.auth.signOut()
      if (typeof window !== 'undefined') window.location.href = '/login'
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`Could not delete your data: ${message}`)
      setDeleting(false)
    }
  }

  // GDPR right to data portability. Generates a complete JSON dump of
  // the user's data and triggers a browser download. Not Plus-gated —
  // privacy rights cannot be paywalled. Implemented inline rather than
  // redirecting to /dashboard/export because that surface is Plus-only
  // and the legal export must be free for every user.
  async function handleExportAll() {
    if (typeof window === 'undefined') return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const [{ data: transactions }, { data: categories }, { data: budgets }, { data: rules }] =
      await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).order('transacted_at'),
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('budgets').select('*').eq('user_id', user.id),
        supabase.from('recurring_rules').select('*').eq('user_id', user.id),
      ])

    const exported_at = new Date().toISOString()
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: 'Murmur',
            version: 1,
            exported_at,
            profile,
            transactions: transactions ?? [],
            categories: categories ?? [],
            budgets: budgets ?? [],
            recurring_rules: rules ?? [],
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )

    const stamp = exported_at.slice(0, 10)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `murmur-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function pickSection(k: SectionKey) {
    setActive(k)
    const el = sectionRefs.current[k]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    setSaveError(null)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      // Session expired mid-edit — used to leave `saving` stuck `true`
      // forever with the button reading "Saving…" and no way out
      // (fix-plan 2.13 / audit 08-F21 family).
      setSaving(false)
      setSaveError('Your session expired — sign in again.')
      return
    }
    // Parse the income input. Strip thousands separators + currency
    // symbols the user might paste, then `Number()`. Anything that
    // fails to parse saves as null (clear). Negative numbers are
    // clamped to null too — income can't be negative.
    const rawIncome = monthlyIncomeInput.trim()
    let parsedIncome: number | null = null
    if (rawIncome) {
      const cleaned = rawIncome.replace(/[,\s$€£¥]/g, '')
      const n = Number(cleaned)
      parsedIncome = Number.isFinite(n) && n >= 0 ? n : null
    }

    // `currency_code` is deliberately not written here — a currency
    // change is its own migration (`handleCurrencyChange` below), never
    // a field on this bare label-swap form (fix-plan 2.7).
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim() || null,
        locale,
        monthly_income: parsedIncome,
      })
      .eq('id', user.id)
    setSaving(false)
    if (error) {
      // Never claim "Saved." when the write failed (fix-plan 2.13 /
      // audit 08-F21 family) — the unconditional green success message
      // this used to show regardless of the write's outcome.
      setSaveError(error.message)
      return
    }
    // Clears the unsaved-changes guard — these values are now what's
    // actually persisted, not just what's on screen.
    savedFormRef.current = { displayName, locale, monthlyIncomeInput }
    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  // Currency change as a migration, not a label swap (fix-plan 2.7,
  // audit 05-F13/06-F8/08-F5). Used to be folded into `handleSaveAccount`
  // as a bare `currency_code` write — every historical
  // `amount_in_profile_currency` kept its old magnitude under a new
  // symbol. Now: refuse outright while offline, get an explicit "this
  // will reconvert N transactions" confirmation, then drive
  // `change-currency` (via `lib/changeCurrency.ts`) to completion —
  // mirrors `apps/mobile/app/more/settings.tsx`'s `handleCurrencyChange`/
  // `runCurrencyChange` contract exactly, so the two platforms can never
  // silently diverge into "mobile migrates, web relabels" again.
  async function handleCurrencyChange(newCode: string) {
    if (newCode === currency) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCurrencyError("You're offline — reconnect to change currency.")
      return
    }
    const confirmed = window.confirm(
      `Changing your currency to ${newCode} will reconvert ${txnCount} transaction${
        txnCount === 1 ? '' : 's'
      }, your budgets, and your monthly income at their historical exchange rates. This cannot be undone.\n\nContinue?`,
    )
    if (!confirmed) return

    setCurrencyError(null)
    setCurrencyConverting(true)
    setCurrencyProgress(null)
    const result = await changeCurrency(supabase, newCode, (progress) => setCurrencyProgress(progress))
    setCurrencyConverting(false)
    setCurrencyProgress(null)

    if (!result.ok) {
      setCurrencyError(
        result.error === 'offline' ? "You're offline — reconnect to change currency." : result.error,
      )
      return
    }

    // The server already committed the new `profiles.currency_code`
    // and every reconverted transaction — reload rather than just
    // flipping local state, so this screen (and everything it reads)
    // stops showing pre-conversion figures.
    setCurrency(newCode)
    await load()
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  const initial = (displayName || email || 'U').trim()[0]?.toUpperCase() ?? 'U'
  const { isPlus } = usePlus()
  const plan = describePlus(profile)
  const fmtPlanDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar title="Settings" />
      <div style={styles.page}>
        <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
          Settings
        </div>

        {loadError && (
          // Distinct from a blank/new profile (fix-plan 2.13 / audit
          // 08-F21 family) — this page has no other loading/empty gate,
          // so a failed read used to leave every field silently showing
          // its default value with no indication anything failed.
          <ErrorState compact message="We couldn't load your settings." detail={loadError} onRetry={load} />
        )}

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
                    {/* Changing this fires its own confirm/migrate flow
                        immediately (fix-plan 2.7) — it is not part of
                        "Save changes" below, because a currency change
                        is a data migration, never a silent relabel. */}
                    <select
                      value={currency}
                      onChange={(e) => void handleCurrencyChange(e.target.value)}
                      disabled={currencyConverting}
                      style={styles.select}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {currencyConverting && (
                      <div style={styles.currencyStatus}>
                        Converting…
                        {currencyProgress && currencyProgress.total > 0
                          ? ` ${currencyProgress.converted} / ${currencyProgress.total} transactions`
                          : ''}
                      </div>
                    )}
                    {!currencyConverting && currencyError && (
                      <div style={styles.currencyStatusError}>{currencyError}</div>
                    )}
                  </div>
                  {/* Fix-plan 3.6 / audit 07-F17: `packages/shared/src/i18n`
                      ships four complete locales, but no web page imports
                      `t()` — this picker used to change `profiles.locale`
                      while every string on every dashboard page stayed
                      English regardless. A picker that only half-works is
                      worse than an honest read-only row: translating the
                      web dashboard is real, tracked follow-up work, not
                      done here. `locale` still drives this page's own
                      `Intl` number/date formatting and stays whatever the
                      mobile app (which *is* fully translated) last set. */}
                  <div style={{ ...styles.field, flex: 1 }}>
                    <label style={styles.label}>Language</label>
                    <div style={styles.readOnlyValue}>
                      {LOCALES.find((l) => l.value === locale)?.label ?? locale}
                    </div>
                    <div style={{ fontSize: 11, color: colors.ink3, marginTop: 4 }}>
                      The web dashboard is English-only for now. Change your language from the mobile app.
                    </div>
                  </div>
                </div>
                {/* Monthly income — fed to Ask Murmur for affordability
                    reasoning. Same field that exists in mobile Settings →
                    Preferences. Leaving it blank stores null (the column
                    has always been nullable). */}
                <div style={styles.field}>
                  <label style={styles.label}>Monthly income ({currency})</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={monthlyIncomeInput}
                    onChange={(e) => setMonthlyIncomeInput(e.target.value)}
                    placeholder="Leave blank to skip"
                    style={styles.input}
                  />
                  <div style={{ fontSize: 12, color: colors.ink3, marginTop: 6 }}>
                    Used by Ask Murmur to reason about affordability and
                    savings rate. Stays on your account; never shared.
                  </div>
                </div>
                <div style={styles.actions}>
                  {saveError && <span style={styles.saveErrorMsg}>{saveError}</span>}
                  {!saveError && success && <span style={styles.successMsg}>Saved.</span>}
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
              {/* Fix-plan 3.7: real `devices` rows, populated by mobile's
                  `deviceRegistry.ts` on sign-in and stamped with
                  `last_synced_at` on every successful drain — replacing the
                  single hardcoded "This device · Synced just now · web
                  companion" row that rendered unconditionally, including
                  offline and including on an account that had never opened
                  the mobile app at all. Web/desktop don't register a device
                  of their own (no offline outbox to report sync state
                  for), so an empty list here is itself true information —
                  a fabricated row would be worse than none. */}
              {devices.length === 0 ? (
                <SettingRow
                  label="No devices synced yet"
                  sub="Sign in on the mobile app to see it here."
                />
              ) : (
                devices.map((d) => (
                  <SettingRow
                    key={d.id}
                    label={d.device_name || platformLabel(d.platform)}
                    sub={formatRelativeSync(d.last_synced_at)}
                    right={
                      <Tag color={colors.accent} bg={colors.accentSoft}>
                        {platformLabel(d.platform).toUpperCase()}
                      </Tag>
                    }
                  />
                ))
              )}
              {/* Read-only — fix-plan 1.3 part 1. Captured automatically
                  from the browser (see TimezoneSync in dashboard/layout.tsx)
                  whenever it drifts from what's stored; there is nothing
                  here for the user to set directly. Falls back to the
                  browser's own resolved zone for the render before that
                  capture has landed, so this never shows a stale 'UTC'. */}
              <SettingRow
                label="Time zone"
                sub={profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
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
                Encrypted in transit and at rest, protected by row-level security tied to your account. Murmur stores your transactions but never connects to your bank.
              </div>
            </SettingsCard>

            {/* Plan & billing — the real entitlement (server-written plus_*
                columns via describePlus; payments, Aug 16 2026). Web does not
                sell Plus (iOS subscription through RevenueCat); it shows what
                the account has, links Apple's manage page for a subscriber,
                and offers Refresh for someone who just subscribed on the
                phone. History (fix-plan 3.1): a fabricated "Yearly · renews on
                your billing date" card, then an honest preview state. */}
            <SettingsCard
              title="Plan & billing"
              refCb={(el) => (sectionRefs.current.plan = el)}
              right={
                isPlus ? (
                  <Tag color={colors.accent} bg={colors.accentSoft}>PLUS</Tag>
                ) : (
                  <Tag color="#7A4A22" bg="#F2E5D5">FREE</Tag>
                )
              }
            >
              <SettingRow
                label={
                  plan.kind === 'trial'
                    ? 'Murmur Plus · Free trial'
                    : plan.kind === 'active'
                      ? `Murmur Plus${plan.plan ? ` · ${plan.plan === 'yearly' ? 'Yearly' : 'Monthly'}` : ''}`
                      : 'Free plan'
                }
                sub={
                  plan.kind === 'trial'
                    ? `Trial ends ${fmtPlanDate(plan.endsAt)}${plan.willRenew ? ', then your plan starts' : ' — auto-renew is off'}`
                    : plan.kind === 'active'
                      ? plan.storeBacked
                        ? plan.endsAt
                          ? `${plan.willRenew ? 'Renews' : 'Ends'} ${fmtPlanDate(plan.endsAt)}`
                          : 'Active'
                        : 'Early access — subscribe in the Murmur app on your iPhone to keep Plus.'
                      : plan.kind === 'lapsed'
                        ? `Plus ended ${fmtPlanDate(plan.endedAt)}`
                        : 'Ask Murmur, recurring detection, export and this desktop app are part of Murmur Plus.'
                }
                right={
                  (plan.kind === 'active' || plan.kind === 'trial') && plan.storeBacked ? (
                    <a
                      href={PLUS_MANAGE_URL_APPLE}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: font.sans, fontSize: 12, fontWeight: 600, color: colors.accent }}
                    >
                      Manage on Apple
                    </a>
                  ) : undefined
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
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <span>
                    Subscribe in the Murmur app on your iPhone (Settings → Subscription). Plans, prices and the
                    free trial are shown there; your account unlocks everywhere, including here.
                  </span>
                  <PlusRefreshButton compact />
                </div>
              )}
            </SettingsCard>

            <SettingsCard
              title="Privacy"
              refCb={(el) => (sectionRefs.current.privacy = el)}
            >
              {/* Fix-plan 3.5 / audit 06-F39: this used to be a live toggle
                  writing `profiles.analytics_opt_in` / `crash_reports_opt_in`
                  while mobile's own Privacy screen told the user analytics
                  are shared "Never" — and nothing anywhere reads either
                  column, so the toggle changed a value with no effect. One
                  product decision (no analytics, no crash reporting
                  collected today), mirrored on both platforms, instead of a
                  control that does nothing. */}
              <SettingRow label="Anonymous usage analytics" sub="Not collected." />
              <SettingRow label="Crash reporting" sub="Not collected." />
              {/* GDPR-grade controls, mirrored to mobile Privacy.
                  Export-all is free for every user (right to data
                  portability — can't be paywalled). Delete-all calls
                  the `delete-user` Edge Function which scrubs every
                  table the user touches and removes their auth user. */}
              <SettingRow
                label="Export all my data"
                sub="Download a complete JSON copy"
                right={
                  <button type="button" onClick={handleExportAll} style={styles.linkBtn}>
                    Export
                  </button>
                }
              />
              <SettingRow
                label="Delete everything permanently"
                sub="Removes your account and all data. Cannot be undone."
                right={
                  <button
                    type="button"
                    onClick={handleDeleteAll}
                    disabled={deleting}
                    style={{ ...styles.linkBtn, color: colors.destructive ?? '#A94646' }}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                }
              />
            </SettingsCard>

            <SettingsCard
              title="Voice & language"
              refCb={(el) => (sectionRefs.current.voice = el)}
            >
              {/* Fix-plan 3.5 / audit 02-F4, 02-F16: speech-to-text runs on
                  the phone (true), but the resulting text is sent to our
                  server and to OpenAI to extract the amount, merchant and
                  category — an "ON-DEVICE" tag on this row claimed the
                  whole pipeline never leaves the device. */}
              <SettingRow
                label="Voice engine"
                sub="On-device speech-to-text (mobile) · OpenAI for extraction"
              />
              {/* Fix-plan 3.7: `profiles.voice_language` (e.g. "en-US") is
                  the column mobile's speech recognizer actually reads —
                  `locale` (the UI/display-string language, e.g. "en") is a
                  different setting that happens to default from the same
                  value. Reading the UI locale here could show "FR" while
                  the phone still recognizes English speech. */}
              <SettingRow
                label="Recognition language"
                sub="Used by the mic in Ask Murmur and the mobile capture flow."
                right={
                  <span style={{ fontSize: 13, color: colors.ink2, fontWeight: 600 }}>
                    {(profile?.voice_language ?? locale).toUpperCase()}
                  </span>
                }
              />
            </SettingsCard>

            <SettingsCard
              title="Export"
              refCb={(el) => (sectionRefs.current.export = el)}
            >
              {/* Same label mobile's Settings row uses for this feature
                  (audit 08-F44) — distinct from the Privacy card's "Export
                  all my data" above, which is a different, free, complete
                  JSON backup rather than this formatted CSV/JSON/PDF
                  transaction report. */}
              <SettingRow
                label="Export transactions"
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
              {/* Fix-plan 3.6 / audit 08-F33: `support@murmur.app` has no MX
                  record — every message sent to it bounced. Hidden while
                  `SUPPORT_EMAIL` is unset (see its doc comment in
                  packages/shared/src/brand.ts) rather than offering a
                  channel that silently drops what's sent to it. */}
              {SUPPORT_EMAIL && SUPPORT_MAILTO && (
                <SettingRow
                  label="Help & contact"
                  sub={SUPPORT_EMAIL}
                  right={
                    <a
                      href={SUPPORT_MAILTO}
                      style={styles.linkBtn}
                    >
                      Email
                    </a>
                  }
                />
              )}
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
  // A read-only stand-in for `input`/`select` — same box, no interaction
  // affordance. Used where a field is informational only (fix-plan 3.6's
  // Language row: real data, not editable from here).
  readOnlyValue: {
    padding: '8px 12px',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink2,
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
  saveErrorMsg: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.destructive ?? '#A94646',
    fontWeight: 600,
  },
  currencyStatus: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
    marginTop: 6,
  },
  currencyStatusError: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.destructive ?? '#A94646',
    marginTop: 6,
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
