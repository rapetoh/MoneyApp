import { useState, useCallback, useEffect } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Linking from 'expo-linking'
import { useAuth, signOut } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useActiveBudget } from '../../src/hooks/useBudget'
import { useNotificationListener } from '../../src/hooks/useNotificationListener'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'
import { useApiUrl } from '../../src/hooks/useApiUrl'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS']

const BUDGET_PERIODS: { value: BudgetPeriod; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly (every 2 weeks)' },
  { value: 'monthly', label: 'Monthly' },
]

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string
  value?: string
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} disabled={!onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress && <Text style={styles.rowChevron}>›</Text>}
    </Pressable>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

export default function SettingsScreen() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const { budget, setBudget } = useActiveBudget(user?.id)

  const [budgetModal, setBudgetModal] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>('monthly')
  const [localeModal, setLocaleModal] = useState(false)
  const [currencyModal, setCurrencyModal] = useState(false)
  const [nameModal, setNameModal] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [apiUrlModal, setApiUrlModal] = useState(false)
  const [apiUrlInput, setApiUrlInput] = useState('')
  const { apiUrl, setApiUrl, resetApiUrl, defaultUrl } = useApiUrl()

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const localeName = LOCALES.find((l) => l.value === locale)?.label ?? 'English'

  const periodLabel = BUDGET_PERIODS.find((p) => p.value === (budget?.period ?? 'monthly'))?.label ?? 'Monthly'
  const budgetDisplay = budget
    ? `${currency} ${budget.amount.toFixed(0)} / ${periodLabel}`
    : '—'

  async function handleSignOut() {
    Alert.alert(t('auth.sign_out', locale), 'Are you sure?', [
      { text: t('common.cancel', locale), style: 'cancel' },
      { text: t('auth.sign_out', locale), style: 'destructive', onPress: () => signOut() },
    ])
  }

  function openBudgetModal() {
    setBudgetInput(budget ? String(budget.amount) : '')
    setBudgetPeriod(budget?.period ?? 'monthly')
    setBudgetModal(true)
  }

  async function handleSaveBudget() {
    const amount = parseFloat(budgetInput.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      Alert.alert(t('common.error', locale), 'Enter a valid budget amount.')
      return
    }
    const ok = await setBudget(amount, budgetPeriod, currency)
    if (!ok) Alert.alert(t('common.error', locale), 'Could not save budget.')
    setBudgetModal(false)
    setBudgetInput('')
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return
    await updateProfile({ display_name: nameInput.trim() })
    setNameModal(false)
    setNameInput('')
  }

  // Android notification listener — no-op on iOS
  const { permissionGranted, recheckPermission, requestPermission } = useNotificationListener(
    () => {},
  )

  const handleNotificationToggle = useCallback(async () => {
    if (permissionGranted) {
      Alert.alert(
        'Disable Payment Notifications',
        'To disable, open Settings > Apps > Special app access > Notification access and remove this app.',
        [{ text: 'OK' }],
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
  }, [permissionGranted, requestPermission, recheckPermission])

  const SHORTCUT_INSTALL_URL = 'https://www.icloud.com/shortcuts/placeholder'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('settings.title', locale)}</Text>

        {/* Account */}
        <SettingsSection title="Account">
          <SettingsRow label={t('auth.email', locale)} value={user?.email ?? '—'} />
          <View style={styles.divider} />
          <SettingsRow
            label="Display Name"
            value={profile?.display_name ?? '—'}
            onPress={() => {
              setNameInput(profile?.display_name ?? '')
              setNameModal(true)
            }}
          />
        </SettingsSection>

        {/* Preferences */}
        <SettingsSection title="Preferences">
          <SettingsRow
            label={t('settings.income', locale)}
            value={budgetDisplay}
            onPress={openBudgetModal}
          />
          <View style={styles.divider} />
          <SettingsRow
            label={t('settings.language', locale)}
            value={localeName}
            onPress={() => setLocaleModal(true)}
          />
          <View style={styles.divider} />
          <SettingsRow
            label={t('settings.currency', locale)}
            value={currency}
            onPress={() => setCurrencyModal(true)}
          />
        </SettingsSection>

        {/* Automations */}
        <SettingsSection title="Automations">
          {Platform.OS === 'ios' && (
            <SettingsRow
              label="Apple Pay Shortcut"
              value="Set Up"
              onPress={() => Linking.openURL(SHORTCUT_INSTALL_URL)}
            />
          )}
          {Platform.OS === 'android' && (
            <>
              <View style={styles.automationRow}>
                <View style={styles.automationTextGroup}>
                  <Text style={styles.rowLabel}>Payment Notifications</Text>
                  <Text style={styles.automationHint}>
                    Auto-detect charges from banking apps
                  </Text>
                </View>
                <Pressable
                  style={[styles.toggle, permissionGranted && styles.toggleOn]}
                  onPress={handleNotificationToggle}
                  hitSlop={8}
                >
                  <View style={[styles.toggleThumb, permissionGranted && styles.toggleThumbOn]} />
                </Pressable>
              </View>
              {!permissionGranted && (
                <Text style={styles.automationDisclaimer}>
                  Tap to grant Notification Access. Only payment amounts and merchant names are
                  captured — raw notification text is never stored.
                </Text>
              )}
            </>
          )}
          {Platform.OS === 'ios' && (
            <Text style={styles.automationDisclaimer}>
              Install the Apple Pay Shortcut to automatically log charges. The shortcut opens the
              app with the amount pre-filled — you confirm before it saves.
            </Text>
          )}
        </SettingsSection>

        {/* Developer */}
        <SettingsSection title="Developer">
          <SettingsRow
            label="AI Server URL"
            value={apiUrl}
            onPress={() => { setApiUrlInput(apiUrl); setApiUrlModal(true) }}
          />
        </SettingsSection>

        {/* About */}
        <SettingsSection title="About">
          <SettingsRow label="Version" value="1.0.0" />
        </SettingsSection>

        {/* Sign out */}
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>{t('auth.sign_out', locale)}</Text>
        </Pressable>
      </ScrollView>

      {/* Budget modal */}
      <Modal visible={budgetModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setBudgetModal(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.income', locale)}</Text>
            <Pressable onPress={handleSaveBudget}>
              <Text style={styles.modalDone}>{t('common.save', locale)}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.modalHint}>
              Set your spending budget. Safe to Spend will track your remaining amount.
            </Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>{currency}</Text>
              <TextInput
                style={styles.amountInput}
                value={budgetInput}
                onChangeText={setBudgetInput}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            <Text style={styles.modalSectionLabel}>Budget Period</Text>
            <View style={styles.periodList}>
              {BUDGET_PERIODS.map((p, i) => (
                <View key={p.value}>
                  {i > 0 && <View style={styles.divider} />}
                  <Pressable
                    style={styles.periodRow}
                    onPress={() => setBudgetPeriod(p.value)}
                  >
                    <Text style={styles.periodLabel}>{p.label}</Text>
                    {budgetPeriod === p.value && (
                      <Text style={styles.periodCheck}>✓</Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Currency modal */}
      <Modal visible={currencyModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCurrencyModal(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.currency', locale)}</Text>
            <View style={{ width: 60 }} />
          </View>
          {CURRENCIES.map((c, i) => (
            <View key={c}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                style={styles.localeRow}
                onPress={async () => {
                  await updateProfile({ currency_code: c })
                  setCurrencyModal(false)
                }}
              >
                <Text style={styles.localeLabel}>{c}</Text>
                {currency === c && <Text style={styles.localeCheck}>✓</Text>}
              </Pressable>
            </View>
          ))}
        </View>
      </Modal>

      {/* Locale modal */}
      <Modal visible={localeModal} animationType="slide" presentationStyle="pageSheet">
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
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                style={styles.localeRow}
                onPress={async () => {
                  await updateProfile({ locale: l.value })
                  setLocaleModal(false)
                }}
              >
                <Text style={styles.localeLabel}>{l.label}</Text>
                {profile?.locale === l.value && (
                  <Text style={styles.localeCheck}>✓</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      </Modal>

      {/* API URL modal */}
      <Modal visible={apiUrlModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setApiUrlModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>AI Server URL</Text>
            <Pressable onPress={async () => { await setApiUrl(apiUrlInput); setApiUrlModal(false) }}>
              <Text style={styles.modalDone}>Save</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalHint}>
              Enter the URL of your local Next.js dev server (e.g. http://192.168.1.5:3000).
              Change this without rebuilding the app.
            </Text>
            <TextInput
              style={styles.nameInput}
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder={defaultUrl}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={async () => { await setApiUrl(apiUrlInput); setApiUrlModal(false) }}
            />
            <Pressable onPress={async () => { await resetApiUrl(); setApiUrlModal(false) }}>
              <Text style={[styles.modalCancel, { color: Colors.primary, textAlign: 'center', marginTop: Spacing.sm }]}>
                Reset to default
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Name modal */}
      <Modal visible={nameModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setNameModal(false)}>
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Display Name</Text>
            <Pressable onPress={handleSaveName}>
              <Text style={styles.modalDone}>{t('common.save', locale)}</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Your name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing['3xl'] },
  title: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size['2xl'], color: Colors.text },
  section: { gap: Spacing.xs },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: Spacing.xs,
  },
  sectionCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  rowLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.text, flex: 1 },
  rowValue: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.textSecondary },
  rowChevron: { fontSize: 18, color: Colors.textMuted, marginLeft: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.base },
  signOutButton: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.destructive,
    marginTop: Spacing.sm,
  },
  signOutText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.destructive },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.md, color: Colors.text },
  modalCancel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.textSecondary, width: 60 },
  modalDone: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.primary, textAlign: 'right', width: 60 },
  modalBody: { padding: Spacing.base, gap: Spacing.base },
  modalHint: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  modalSectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border },
  currencySymbol: { fontFamily: Typography.fontFamily.monoBold, fontSize: Typography.size.lg, color: Colors.textSecondary },
  amountInput: { flex: 1, fontFamily: Typography.fontFamily.monoBold, fontSize: Typography.size['3xl'], color: Colors.text },
  periodList: { backgroundColor: Colors.card, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  periodLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.text },
  periodCheck: { color: Colors.primary, fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.base },
  nameInput: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  localeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.card },
  localeLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.text },
  localeCheck: { color: Colors.primary, fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.base },

  // Automations section
  automationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  automationTextGroup: { flex: 1, gap: 2 },
  automationHint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  automationDisclaimer: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: Colors.primary },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.white,
    alignSelf: 'flex-start',
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
})
