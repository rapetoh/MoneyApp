import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Platform,
  AppState,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Linking from 'expo-linking'
import Constants from 'expo-constants'
import { useAuth, signOut } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useActiveBudget } from '../../src/hooks/useBudget'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { useNotificationListener } from '../../src/hooks/useNotificationListener'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import { useApiUrl } from '../../src/hooks/useApiUrl'
import { changeCurrency } from '../../src/services/profileCurrency'
import { SetGroup, SetRow } from '../../src/components/SettingsList'
import { manageSubscription } from '../../src/services/purchases'
import { BudgetEditorModal } from '../../src/components/BudgetEditorModal'
import { IncomeEditorModal } from '../../src/components/IncomeEditorModal'
import {
  isUserOptedOut as isDunningOptedOut,
  setUserOptedOut as setDunningOptedOut,
  ensureDayTwoPermissionAndSchedule,
} from '../../src/services/dayTwoDunning'
import { exportAndShare, type ExportFormat } from '../../src/services/exportData'
import { useCategories } from '../../src/hooks/useCategories'
import { usePlusStatus } from '../../src/hooks/usePlusStatus'
import { syncManager } from '../../src/services/sync/SyncManager'
import {
  getDeadLetterEntries,
  clearDeadLetterEntry,
  retryDeadLetterEntry,
  type QueueEntry,
} from '../../src/services/sync/syncQueue'
import { getDeviceLastSynced } from '../../src/services/sync/deviceRegistry'
import { Colors, Typography, Radius, Hairline, Spacing } from '../../src/theme'
import {
  t,
  formatMoney,
  type Locale,
  describePlus,
} from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'
import { useRouter } from 'expo-router'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
]
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS']
const BUDGET_PERIODS: { value: BudgetPeriod; key: string }[] = [
  { value: 'weekly', key: 'settings.period_weekly' },
  { value: 'biweekly', key: 'settings.period_biweekly' },
  { value: 'monthly', key: 'settings.period_monthly' },
]

/** "5 minutes ago" / "yesterday" / "3 days ago", correctly localized via
 *  ICU rather than a hand-rolled English-only string (fix-plan 3.7 — the
 *  "Last synced" row). Falls back to a plain date if `RelativeTimeFormat`
 *  is unavailable on the device's ICU build. */
function formatLastSynced(iso: string | null, locale: Locale): string {
  if (!iso) return t('settings.sync_never', locale)
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    if (minutes < 1) return rtf.format(0, 'minute')
    if (minutes < 60) return rtf.format(-minutes, 'minute')
    const hours = Math.round(minutes / 60)
    if (hours < 24) return rtf.format(-hours, 'hour')
    return rtf.format(-Math.round(hours / 24), 'day')
  } catch {
    return new Date(iso).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }
}

/**
 * Settings screen. Matches `S_Settings` in
 * docs/money-app/project/mobile-screens-4.jsx:
 *
 *   - Profile card at top: avatar tile + name + "Free plan · N expenses" +
 *     "Upgrade" sage pill.
 *   - Groups as SetGroup cards using shared SetRow primitives.
 *
 * Preserves every functional row and modal from the prior Settings
 * implementation — wires them into the new visual chrome rather than
 * removing features.
 */
export default function SettingsScreen() {
  const { user } = useAuth()
  const { profile, updateProfile, refetch: refetchProfile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const { categories } = useCategories(user?.id)
  const { budget, setBudget } = useActiveBudget(user?.id)
  const { rules: recurringRules } = useRecurringRules(user?.id)
  const router = useRouter()
  const { isPlus } = usePlusStatus()

  const [budgetModal, setBudgetModal] = useState(false)
  const [incomeModal, setIncomeModal] = useState(false)
  const [localeModal, setLocaleModal] = useState(false)
  const [currencyModal, setCurrencyModal] = useState(false)
  const [nameModal, setNameModal] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [apiUrlModal, setApiUrlModal] = useState(false)
  const [apiUrlInput, setApiUrlInput] = useState('')
  const { apiUrl, setApiUrl, resetApiUrl, defaultUrl } = useApiUrl()

  // Currency-change flow (fix-plan 2.7) — `currencyConverting` blocks the
  // picker from being dismissed mid-run and gates the progress row below;
  // `currencyProgress` is `null` until the first batch reports back, so
  // the row reads "Converting…" before any counts exist yet.
  const [currencyConverting, setCurrencyConverting] = useState(false)
  const [currencyProgress, setCurrencyProgress] = useState<{
    converted: number
    total: number
  } | null>(null)

  const locale = (profile?.locale ?? 'en') as Locale
  // Settings copy for the subscription, derived only from the server-
  // written entitlement columns (payments, Aug 16 2026).
  const plan = describePlus(profile)
  const planDateFmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '-'
  const planName = (p: 'monthly' | 'yearly' | null) =>
    p === 'yearly'
      ? t('paywall.plan_yearly', locale)
      : p === 'monthly'
        ? t('paywall.plan_monthly', locale)
        : t('settings.plan_plus', locale)
  const planLine =
    plan.kind === 'trial'
      ? t('settings.plan_trial', locale).replace('{date}', planDateFmt(plan.endsAt))
      : plan.kind === 'active'
        ? t('settings.plan_plus', locale)
        : t('settings.plan_free', locale)
  const planDetail =
    plan.kind === 'trial'
      ? t('settings.plan_trial', locale).replace('{date}', planDateFmt(plan.endsAt))
      : plan.kind === 'active'
        ? plan.storeBacked
          ? t(plan.willRenew ? 'settings.plan_active_renews' : 'settings.plan_active_ends', locale)
              .replace('{plan}', planName(plan.plan))
              .replace('{date}', planDateFmt(plan.endsAt))
          : // Hand-granted early access — no store subscription; the row
            // routes to the paywall so the user can subscribe.
            t('settings.get_plus', locale)
        : plan.kind === 'lapsed'
          ? t('settings.plan_lapsed', locale).replace('{date}', planDateFmt(plan.endedAt))
          : t('settings.get_plus', locale)
  const currency = profile?.currency_code ?? 'USD'
  const localeName = LOCALES.find((l) => l.value === locale)?.label ?? 'English'

  // The Voice engine row reports what recognition actually does on THIS
  // device, not a marketing constant: `useVoice` starts recognition with
  // `requiresOnDeviceRecognition: true`, which the module only honours
  // when the device supports on-device recognition — otherwise it falls
  // back to Apple's networked recognizer. Same check, same truth.
  const voiceEngineDetail = useMemo(() => {
    try {
      return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
        ? t('settings.voice_engine_on_device', locale)
        : t('settings.voice_engine_apple', locale)
    } catch {
      return t('settings.voice_engine_apple', locale)
    }
  }, [locale])

  // Fix-plan 1.3: read-only display of the device's own zone (distinct from
  // `profiles.timezone`, which `useProfile.ts` captures and writes through
  // on launch) — `Intl` reads it directly with no async dependency, so this
  // row can never show a stale value the way the six 'UTC' production
  // profiles did before the capture existed.
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Fix-plan 1.6 point 4: the sync-health row. `SyncFailureBanner` already
  // covers the always-visible failure pill; this is the fuller Settings
  // surface that banner's own doc comment defers here — pending/dead
  // counts from the same `syncManager.addListener` channel, plus per-entry
  // `last_error`, retry and discard wired to the outbox's own recovery API.
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [deadCount, setDeadCount] = useState(0)
  const [syncIssuesModal, setSyncIssuesModal] = useState(false)
  const [deadEntries, setDeadEntries] = useState<QueueEntry[]>([])
  // "Last synced" — the signal 1.6's pending/dead counts never carried:
  // pending===0 && dead===0 answers "is the outbox clean right now?" but
  // not "when did this device last actually reach the server?" (fix-plan
  // 3.7). Refetched on mount and every time a drain pass completes
  // (`syncing` flips back to false), since that's exactly when
  // `SyncManager` may have just stamped `devices.last_synced_at`.
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const refreshLastSynced = useCallback(() => {
    if (!user?.id) return
    getDeviceLastSynced(user.id).then(setLastSyncedAt)
  }, [user?.id])

  useEffect(() => {
    refreshLastSynced()
  }, [refreshLastSynced])

  useEffect(() => {
    return syncManager.addListener((syncing, pending, dead) => {
      setPendingCount(pending)
      setIsSyncing(syncing)
      setDeadCount(dead)
      if (!syncing) refreshLastSynced()
    })
  }, [refreshLastSynced])

  const refreshDeadEntries = useCallback(async () => {
    setDeadEntries(await getDeadLetterEntries())
  }, [])

  function openSyncIssues() {
    refreshDeadEntries()
    setSyncIssuesModal(true)
  }

  async function handleRetryEntry(id: number) {
    await retryDeadLetterEntry(id)
    await refreshDeadEntries()
    syncManager.drainQueue()
  }

  async function handleRetryAllEntries() {
    await Promise.all(deadEntries.map((entry) => retryDeadLetterEntry(entry.id)))
    await refreshDeadEntries()
    syncManager.drainQueue()
  }

  async function handleDiscardEntry(id: number) {
    await clearDeadLetterEntry(id)
    await refreshDeadEntries()
  }

  // Day-2 dunning toggle. Reads from SecureStore on mount; writes back +
  // cancels the pending notification on opt-out, re-prompts permission and
  // reschedules on opt-in. `null` while the SecureStore read is in flight
  // so the toggle doesn't flicker on cold start.
  const [dunningEnabled, setDunningEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    isDunningOptedOut().then((out) => setDunningEnabled(!out))
  }, [])
  // Plus-gated data export. Free users tapping the row see the paywall;
  // Plus users get a three-button format picker (CSV / JSON / PDF) that
  // hands the file off to the system share sheet.
  const [exportPickerOpen, setExportPickerOpen] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)
  function openExport() {
    if (!isPlus) {
      router.push('/more/paywall')
      return
    }
    setExportPickerOpen(true)
  }
  async function runExport(format: ExportFormat) {
    setExporting(format)
    try {
      await exportAndShare(format, {
        transactions,
        categories,
        locale,
        currency,
        // fix-plan 2.15: the mobile export previously omitted recurring
        // rules and the profile's own zone entirely — a user who left via
        // the phone lost their subscription configuration on export, and
        // every date column fell back to the device's resolved zone
        // rather than `profiles.timezone`, which can disagree with it.
        recurringRules,
        timezone: profile?.timezone || undefined,
      })
      setExportPickerOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert(t('export.failed_title', locale), message)
    } finally {
      setExporting(null)
    }
  }

  const handleDunningToggle = useCallback(async () => {
    if (dunningEnabled === null) return
    const next = !dunningEnabled
    setDunningEnabled(next)
    if (next) {
      await setDunningOptedOut(false)
      await ensureDayTwoPermissionAndSchedule(locale)
    } else {
      await setDunningOptedOut(true)
    }
  }, [dunningEnabled, locale])

  const periodKey =
    BUDGET_PERIODS.find((p) => p.value === (budget?.period ?? 'monthly'))?.key ??
    'settings.period_monthly'
  const periodLabel = t(periodKey, locale)
  // The shared formatter (fix-plan 2.6) — replaces the `"${currency}
  // ${amount.toFixed(0)}"` concatenation, which printed the raw ISO code
  // instead of a currency glyph and ignored the user's own locale.
  const budgetDisplay = budget
    ? `${formatMoney(budget.amount, currency, locale)} / ${periodLabel}`
    : '-'

  // Income row detail: "$7,000 · Microsoft" or "$7,000" if no source, or "—"
  // if the user skipped income entry during onboarding. Same shared-
  // formatter fix as `budgetDisplay` above — the old `toLocaleString
  // ('en-US', ...)` hard-coded US grouping for every locale. Exact
  // precision, not `compact` — 1.4's precision policy reserves `compact`
  // for chart axes; a settings row showing the user's own figure back to
  // them is a precise amount, the same class as a hero or a row.
  const incomeAmountFmt =
    profile?.monthly_income != null ? formatMoney(profile.monthly_income, currency, locale) : null
  const incomeDisplay = incomeAmountFmt
    ? profile?.monthly_income_source
      ? `${incomeAmountFmt} · ${profile.monthly_income_source}`
      : incomeAmountFmt
    : '-'

  const txnCount = transactions.filter((x) => !x.is_deleted).length
  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? '-'
  const initial = (profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()

  async function handleSignOut() {
    Alert.alert(t('auth.sign_out', locale), t('settings.confirm_sign_out', locale), [
      { text: t('common.cancel', locale), style: 'cancel' },
      { text: t('auth.sign_out', locale), style: 'destructive', onPress: () => signOut() },
    ])
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return
    await updateProfile({ display_name: nameInput.trim() })
    setNameModal(false)
    setNameInput('')
  }

  // Currency-change flow (fix-plan 2.7, audit 05-F13/06-F8/08-F5). Used
  // to be `await updateProfile({ currency_code: c })` — a bare label
  // swap that kept every historical `amount_in_profile_currency` at its
  // old magnitude under a new symbol. Now: refuse outright while
  // offline, get an explicit "this will reconvert N transactions"
  // confirmation, then drive `change-currency` (via
  // `services/profileCurrency.ts`) to completion before the picker
  // closes — a currency change is a data migration, never a silent
  // relabel.
  function handleCurrencyChange(newCode: string) {
    if (newCode === currency) {
      setCurrencyModal(false)
      return
    }
    if (!syncManager.online) {
      Alert.alert(
        t('settings.currency_offline_title', locale),
        t('settings.currency_offline_body', locale),
      )
      return
    }
    Alert.alert(
      t('settings.currency_confirm_title', locale),
      `${t('settings.currency_confirm_body_prefix', locale)} ${txnCount} ${t('settings.currency_confirm_body_suffix', locale)}`,
      [
        { text: t('common.cancel', locale), style: 'cancel' },
        {
          text: t('settings.currency_confirm_action', locale),
          onPress: () => runCurrencyChange(newCode),
        },
      ],
    )
  }

  async function runCurrencyChange(newCode: string) {
    setCurrencyConverting(true)
    setCurrencyProgress(null)
    const result = await changeCurrency(newCode, (progress) => setCurrencyProgress(progress))
    setCurrencyConverting(false)
    setCurrencyProgress(null)

    if (!result.ok) {
      Alert.alert(t('settings.currency_failed_title', locale), result.error)
      return
    }

    // The server already committed the new `profiles.currency_code` and
    // every reconverted transaction — pull both down so this screen (and
    // every other local-first read of `transactions`) stops showing the
    // pre-conversion snapshot instead of waiting for the next natural
    // sync pass.
    await refetchProfile()
    if (user?.id) await syncManager.pullRemote(user.id)
    setCurrencyModal(false)
  }

  // Permission state only — the actual payload → confirm-sheet handler
  // (fix-plan 3.4 / audit 07-F10, 08-F20, 02-F34) is mounted once at the
  // root layout, which can navigate; this screen has no way to reach the
  // confirm sheet itself. Calling the hook with no `onPayment` means no
  // second native subscription competes with the root layout's real one.
  const { permissionGranted, recheckPermission, requestPermission } = useNotificationListener()

  const handleNotificationToggle = useCallback(async () => {
    if (permissionGranted) {
      Alert.alert(
        t('settings.disable_notifications', locale),
        t('settings.disable_notifications_msg', locale),
        [{ text: t('common.ok', locale) }],
      )
      return
    }
    requestPermission()
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        await recheckPermission()
        sub.remove()
      }
    })
  }, [permissionGranted, requestPermission, recheckPermission, locale])

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card — matches S_Settings avatar + plan pill. The plan
            line and pill are branched on `isPlus` (fix-plan 3.1) - both
            used to be unconditional strings ("Free plan" / "Upgrade")
            regardless of the account's actual entitlement, and the pill
            always said "Upgrade" even though there is no purchase flow
            to upgrade through yet. A Plus account now sees its real plan
            name and no pill (there is nothing to press); a free account
            sees "Free plan" - true today, since entitlement reads
            `profiles.plus_status` alone - and a pill labelled "Plus"
            that opens the honest preview screen, not an "Upgrade" button
            that cannot act. */}
        <View style={styles.profileWrap}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.profilePlan} numberOfLines={1}>
                {planLine} · {txnCount} {t('settings.expenses_count', locale)}
              </Text>
            </View>
            {!isPlus && (
              <Pressable
                style={({ pressed }) => [styles.upgradePill, pressed && styles.upgradePillPressed]}
                onPress={() => router.push('/more/paywall')}
              >
                <Text style={styles.upgradePillText}>{t('settings.upgrade', locale)}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Subscription — the real entitlement (server-written plus_* columns,
            see describePlus) with the only two actions that exist: Apple's
            manage sheet for a subscriber, the paywall for everyone else. */}
        <SetGroup label={t('settings.subscription', locale)}>
          <SetRow
            label={
              plan.kind === 'free'
                ? t('settings.plan_row_free', locale)
                : t('settings.plan_plus', locale)
            }
            detail={planDetail}
            onPress={
              (plan.kind === 'active' || plan.kind === 'trial') && plan.storeBacked
                ? () => {
                    manageSubscription()
                  }
                : () => router.push('/more/paywall')
            }
            last
          />
        </SetGroup>

        {/* Account */}
        <SetGroup label={t('settings.account', locale)}>
          <SetRow label={t('auth.email', locale)} detail={user?.email ?? '-'} chevron={false} />
          <SetRow
            label={t('settings.display_name', locale)}
            detail={profile?.display_name ?? '-'}
            onPress={() => {
              setNameInput(profile?.display_name ?? '')
              setNameModal(true)
            }}
          />
          <SetRow
            label={t('settings.timezone', locale)}
            detail={deviceTimeZone}
            chevron={false}
            last
          />
        </SetGroup>

        {/* Voice & capture — the two ways money enters the app. Matches
            S_Settings in mobile-screens-4.jsx, which groups the Apple Pay
            auto-log row here rather than in a one-row "Automations" group
            (folded in, Aug 29 2026). On Android the equivalent capture
            surface is the notification-listener toggle; the payload it
            grants access to reaches the confirm sheet via the root-level
            listener in app/_layout.tsx (fix-plan 3.4). */}
        <SetGroup label={t('settings.voice_capture', locale)}>
          <SetRow
            label={t('settings.voice_engine', locale)}
            detail={voiceEngineDetail}
            chevron={false}
          />
          {Platform.OS === 'ios' ? (
            <SetRow
              label={t('settings.apple_pay_capture', locale)}
              detail={t('settings.apple_pay_capture_detail', locale)}
              onPress={() => router.push('/more/apple-pay-setup' as never)}
              last
            />
          ) : (
            <SetRow
              label={t('settings.payment_notifications', locale)}
              toggle
              value={permissionGranted}
              onToggle={handleNotificationToggle}
              last
            />
          )}
        </SetGroup>

        {/* Preferences. Language leads — it drives the whole app (UI copy
            AND the voice recognizer's locale), so it belongs with the
            general preferences, not under Voice & capture where it read
            as voice-only. */}
        <SetGroup label={t('settings.preferences', locale)}>
          <SetRow
            label={t('settings.language', locale)}
            detail={localeName}
            onPress={() => setLocaleModal(true)}
          />
          <SetRow
            label={t('settings.currency', locale)}
            detail={currency}
            onPress={() => setCurrencyModal(true)}
          />
          <SetRow
            label={t('settings.budget', locale)}
            detail={budgetDisplay}
            onPress={() => setBudgetModal(true)}
          />
          <SetRow
            label={t('settings.monthly_income', locale)}
            detail={incomeDisplay}
            onPress={() => setIncomeModal(true)}
          />
          <SetRow
            label={t('settings.recurring', locale)}
            onPress={() => router.push('/recurring')}
            last
          />
        </SetGroup>

        {/* Reminders — Day-2 dunning toggle. */}
        <SetGroup label={t('settings.reminders', locale)}>
          <SetRow
            label={t('settings.dunning_label', locale)}
            toggle
            value={dunningEnabled === true}
            onToggle={handleDunningToggle}
            last
          />
        </SetGroup>

        {/* Privacy & data — one group (Aug 29 2026; previously a one-row
            "Data" group and a one-row "Privacy" group). The Privacy
            Center owns the full story + GDPR rights; the export row here
            is the Plus convenience exporter (format picker). */}
        <SetGroup label={t('settings.privacy_data', locale)}>
          <SetRow
            label={t('more.privacy', locale)}
            detail={t('settings.review', locale)}
            onPress={() => router.push('/more/privacy')}
          />
          <SetRow
            label={t('settings.export_label', locale)}
            detail={
              isPlus
                ? t('settings.export_detail_plus', locale)
                : t('settings.export_detail_free', locale)
            }
            onPress={openExport}
            last
          />
        </SetGroup>

        {/* Sync — outbox health (fix-plan 1.6 point 4). Persistent (not
            gated on deadCount > 0) so a user can confirm the outbox is
            clean, not just be told when it isn't. Two rows, not three
            (Aug 29 2026): the old permanent "Pending — 0 queued" row was
            outbox jargon with no action; its signal only matters while
            something is actually queued, so it now surfaces as this
            row's transient detail instead. */}
        <SetGroup label={t('settings.sync', locale)}>
          <SetRow
            label={t('settings.sync_last_synced', locale)}
            detail={
              pendingCount > 0
                ? isSyncing
                  ? t('settings.sync_in_progress', locale)
                  : `${pendingCount} ${t('settings.sync_queued_suffix', locale)}`
                : formatLastSynced(lastSyncedAt, locale)
            }
            chevron={false}
          />
          <SetRow
            label={t('settings.sync_issues', locale)}
            detail={
              deadCount === 0
                ? t('common.none', locale)
                : `${deadCount} ${t('settings.sync_failed_suffix', locale)}`
            }
            onPress={openSyncIssues}
            last
          />
        </SetGroup>

        {/* Developer — dev-client builds only. Never rendered in TestFlight or
            App Store builds; getApiUrl() also rejects stored overrides there. */}
        {__DEV__ && (
          <SetGroup label={t('settings.developer', locale)}>
            <SetRow
              label={t('settings.ai_server_url', locale)}
              detail={apiUrl}
              onPress={() => {
                setApiUrlInput(apiUrl)
                setApiUrlModal(true)
              }}
              last
            />
          </SetGroup>
        )}

        {/* About */}
        <SetGroup label={t('settings.about', locale)}>
          <SetRow label={t('more.help', locale)} onPress={() => router.push('/more/help')} />
          <SetRow
            label={t('settings.version', locale)}
            detail={Constants.expoConfig?.version ?? '-'}
            chevron={false}
            last
          />
        </SetGroup>

        {/* Sign out */}
        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>{t('auth.sign_out', locale)}</Text>
        </Pressable>
      </ScrollView>

      {/* — Modals below are unchanged in behavior; only their chrome uses the same
            ink-accent visual language as before. */}

      {/* Budget modal (shared with the Budgets tab) */}
      <BudgetEditorModal
        visible={budgetModal}
        initialAmount={budget?.amount ?? null}
        initialPeriod={budget?.period ?? null}
        currency={currency}
        locale={locale}
        onSave={async (amount, period) => setBudget(amount, period, currency)}
        onClose={() => setBudgetModal(false)}
      />

      {/* Monthly income modal — edits profile.monthly_income + _source */}
      <IncomeEditorModal
        visible={incomeModal}
        initialAmount={profile?.monthly_income ?? null}
        initialSource={profile?.monthly_income_source ?? null}
        currency={currency}
        locale={locale}
        onSave={async (amount, source) =>
          updateProfile({ monthly_income: amount, monthly_income_source: source })
        }
        onClose={() => setIncomeModal(false)}
      />

      {/* Export format picker (Plus). Three rows: CSV / JSON / PDF.
          Tapping kicks off `runExport`, which builds the file, writes it
          to the cache directory, and hands it to the system share sheet.
          The modal closes on success; failures show an Alert. */}
      <Modal
        visible={exportPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setExportPickerOpen(false)}
      >
        <SafeAreaView style={styles.modal} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setExportPickerOpen(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('export.picker_title', locale)}</Text>
            <View style={{ width: 60 }} />
          </View>
          {(['csv', 'json', 'pdf'] as ExportFormat[]).map((fmt, i) => {
            const isExportingThis = exporting === fmt
            return (
              <View key={fmt}>
                {i > 0 && <View style={styles.rowDivider} />}
                <Pressable
                  style={styles.localeRow}
                  onPress={() => runExport(fmt)}
                  disabled={exporting !== null}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.localeLabel}>{t(`export.fmt_${fmt}_label`, locale)}</Text>
                    <Text style={styles.modalHint}>{t(`export.fmt_${fmt}_hint`, locale)}</Text>
                  </View>
                  {isExportingThis && <ActivityIndicator color={Colors.accent} />}
                </Pressable>
              </View>
            )
          })}
        </SafeAreaView>
      </Modal>

      {/* Currency modal */}
      <Modal
        visible={currencyModal}
        animationType="slide"
        presentationStyle="pageSheet"
        // Blocked while a conversion is in flight — dismissing mid-run
        // would just hide the progress, not stop the request already
        // running server-side, and re-opening Settings would show a
        // currency picker with no way to tell a run is still going.
        onRequestClose={() => !currencyConverting && setCurrencyModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => !currencyConverting && setCurrencyModal(false)}>
              <Text style={[styles.modalCancel, currencyConverting && styles.modalCancelDisabled]}>
                {t('common.cancel', locale)}
              </Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.currency', locale)}</Text>
            <View style={{ width: 60 }} />
          </View>
          {currencyConverting ? (
            <View style={styles.currencyProgressWrap}>
              <ActivityIndicator color={Colors.accent} size="large" />
              <Text style={styles.currencyProgressLabel}>
                {t('settings.currency_converting', locale)}
              </Text>
              {currencyProgress && currencyProgress.total > 0 && (
                <Text style={styles.currencyProgressCount}>
                  {currencyProgress.converted} / {currencyProgress.total}
                </Text>
              )}
            </View>
          ) : (
            CURRENCIES.map((c, i) => (
              <View key={c}>
                {i > 0 && <View style={styles.rowDivider} />}
                <Pressable style={styles.localeRow} onPress={() => handleCurrencyChange(c)}>
                  <Text style={styles.localeLabel}>{c}</Text>
                  {currency === c && <Text style={styles.localeCheck}>✓</Text>}
                </Pressable>
              </View>
            ))
          )}
        </View>
      </Modal>

      {/* Locale modal */}
      <Modal
        visible={localeModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLocaleModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setLocaleModal(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.language', locale)}</Text>
            <View style={{ width: 60 }} />
          </View>
          {LOCALES.map((l, i) => (
            <View key={l.value}>
              {i > 0 && <View style={styles.rowDivider} />}
              <Pressable
                style={styles.localeRow}
                onPress={async () => {
                  await updateProfile({ locale: l.value })
                  setLocaleModal(false)
                }}
              >
                <Text style={styles.localeLabel}>{l.label}</Text>
                {profile?.locale === l.value && <Text style={styles.localeCheck}>✓</Text>}
              </Pressable>
            </View>
          ))}
        </View>
      </Modal>

      {/* API URL modal — dev-client builds only, like the Developer group above */}
      {__DEV__ && (
        <Modal
          visible={apiUrlModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setApiUrlModal(false)}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setApiUrlModal(false)}>
                <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
              </Pressable>
              <Text style={styles.modalTitle}>{t('settings.ai_server_url', locale)}</Text>
              <Pressable
                onPress={async () => {
                  await setApiUrl(apiUrlInput)
                  setApiUrlModal(false)
                }}
              >
                <Text style={styles.modalDone}>{t('common.save', locale)}</Text>
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalHint}>{t('settings.ai_url_hint', locale)}</Text>
              <TextInput
                style={styles.nameInput}
                value={apiUrlInput}
                onChangeText={setApiUrlInput}
                placeholder={defaultUrl}
                placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={async () => {
                  await setApiUrl(apiUrlInput)
                  setApiUrlModal(false)
                }}
              />
              <Pressable
                onPress={async () => {
                  await resetApiUrl()
                  setApiUrlModal(false)
                }}
              >
                <Text
                  style={[
                    styles.modalCancel,
                    { color: Colors.accent ?? Colors.primary, textAlign: 'center', marginTop: 8 },
                  ]}
                >
                  {t('settings.reset_default', locale)}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* Name modal */}
      <Modal
        visible={nameModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNameModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setNameModal(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.display_name', locale)}</Text>
            <Pressable onPress={handleSaveName}>
              <Text style={styles.modalDone}>{t('common.save', locale)}</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder={t('settings.your_name', locale)}
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
          </View>
        </View>
      </Modal>

      {/* Sync issues modal — fix-plan 1.6 point 4: per-entry `last_error`
          with retry/discard wired to the outbox's own recovery API
          (`retryDeadLetterEntry`/`clearDeadLetterEntry`), which had zero
          callers before `SyncFailureBanner` and this row. */}
      <Modal
        visible={syncIssuesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSyncIssuesModal(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSyncIssuesModal(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.sync_issues', locale)}</Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
          >
            {deadEntries.length === 0 ? (
              <Text style={styles.modalHint}>{t('settings.sync_issues_empty', locale)}</Text>
            ) : (
              <>
                {deadEntries.map((entry, i) => (
                  <View key={entry.id}>
                    {i > 0 && <View style={styles.rowDivider} />}
                    <View style={styles.syncIssueRow}>
                      <Text style={styles.syncIssueTitle} numberOfLines={1}>
                        {entry.operation} · {entry.entity_type}
                      </Text>
                      <Text style={styles.syncIssueError} numberOfLines={3}>
                        {entry.last_error ?? t('settings.sync_unknown_error', locale)}
                      </Text>
                      <View style={styles.syncIssueActions}>
                        <Pressable onPress={() => handleRetryEntry(entry.id)} hitSlop={8}>
                          <Text style={styles.modalDone}>{t('common.retry', locale)}</Text>
                        </Pressable>
                        <Pressable onPress={() => handleDiscardEntry(entry.id)} hitSlop={8}>
                          <Text style={[styles.modalDone, styles.syncIssueDiscard]}>
                            {t('settings.sync_discard', locale)}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
                {deadEntries.length > 1 && (
                  <Pressable onPress={handleRetryAllEntries} style={styles.syncRetryAll}>
                    <Text style={styles.modalDone}>{t('settings.sync_retry_all', locale)}</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: {
    paddingTop: 4,
    paddingBottom: 40,
  },

  // Profile card
  profileWrap: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 22,
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3E7DC', // peach-soft per mockup's category tile for the profile avatar
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 18,
    fontWeight: '700',
    color: '#7A4A22',
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink ?? Colors.text,
  },
  profilePlan: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  upgradePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.accent ?? Colors.primary,
  },
  upgradePillPressed: { opacity: 0.8 },
  upgradePillText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.2,
  },

  // Sign-out
  signOutBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 22,
    alignItems: 'center',
    backgroundColor: Colors.surface ?? Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.destructive ?? '#A94646',
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.destructive ?? '#A94646',
  },

  // Modals (kept visually close to prior impl but with ink accent tokens)
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  modalTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink ?? Colors.text,
  },
  modalCancel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink3 ?? Colors.textSecondary,
    width: 60,
  },
  modalCancelDisabled: {
    opacity: 0.35,
  },
  currencyProgressWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  currencyProgressLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
  },
  currencyProgressCount: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  modalDone: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.accent ?? Colors.primary,
    textAlign: 'right',
    width: 60,
  },
  modalBody: { padding: 16, gap: 16 },
  modalHint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 20,
  },
  modalSectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.ink3 ?? Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 0.5,
    borderColor: Colors.line ?? Colors.border,
  },
  currencySymbol: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  amountInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 38,
    fontWeight: '600',
    letterSpacing: -0.6,
    color: Colors.ink ?? Colors.text,
  },
  periodList: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  periodLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
  },
  periodCheck: {
    color: Colors.accent ?? Colors.primary,
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 16,
  },
  rowDivider: {
    height: Hairline.width,
    backgroundColor: Hairline.color,
  },
  nameInput: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
    borderWidth: 0.5,
    borderColor: Colors.line ?? Colors.border,
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: Colors.surface ?? Colors.card,
  },
  localeLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
  },
  localeCheck: {
    color: Colors.accent ?? Colors.primary,
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 16,
  },

  // Sync issues modal
  syncIssueRow: {
    paddingVertical: 12,
    gap: 4,
  },
  syncIssueTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    textTransform: 'capitalize',
  },
  syncIssueError: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  syncIssueActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  syncIssueDiscard: {
    color: Colors.destructive ?? '#A94646',
  },
  syncRetryAll: {
    alignItems: 'center',
    paddingVertical: 14,
  },
})
