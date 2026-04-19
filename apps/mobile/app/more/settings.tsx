import { useState, useCallback } from 'react'
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
import { Ionicons } from '@expo/vector-icons'
import * as Linking from 'expo-linking'
import { useAuth, signOut } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useActiveBudget } from '../../src/hooks/useBudget'
import { useNotificationListener } from '../../src/hooks/useNotificationListener'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'
import { useApiUrl } from '../../src/hooks/useApiUrl'
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
      {onPress && <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} style={styles.rowChevron} />}
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
  const router = useRouter()

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

  const periodKey = BUDGET_PERIODS.find((p) => p.value === (budget?.period ?? 'monthly'))?.key ?? 'settings.period_monthly'
  const periodLabel = t(periodKey, locale)
  const budgetDisplay = budget
    ? `${currency} ${budget.amount.toFixed(0)} / ${periodLabel}`
    : '—'

  async function handleSignOut() {
    Alert.alert(t('auth.sign_out', locale), t('settings.confirm_sign_out', locale), [
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
      Alert.alert(t('common.error', locale), t('settings.invalid_budget', locale))
      return
    }
    const ok = await setBudget(amount, budgetPeriod, currency)
    if (!ok) Alert.alert(t('common.error', locale), t('settings.budget_save_error', locale))
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
        t('settings.disable_notifications', locale),
        t('settings.disable_notifications_msg', locale),
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
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitial}>
              {(profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>
              {profile?.display_name ?? user?.email?.split('@')[0] ?? '—'}
            </Text>
            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>

        {/* Account */}
        <SettingsSection title={t('settings.account', locale)}>
          <SettingsRow label={t('auth.email', locale)} value={user?.email ?? '—'} />
          <View style={styles.divider} />
          <SettingsRow
            label={t('settings.display_name', locale)}
            value={profile?.display_name ?? '—'}
            onPress={() => {
              setNameInput(profile?.display_name ?? '')
              setNameModal(true)
            }}
          />
        </SettingsSection>

        {/* Preferences */}
        <SettingsSection title={t('settings.preferences', locale)}>
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
          <View style={styles.divider} />
          <SettingsRow
            label={t('settings.recurring', locale)}
            onPress={() => router.push('/recurring')}
          />
        </SettingsSection>

        {/* Automations */}
        <SettingsSection title={t('settings.automations', locale)}>
          {Platform.OS === 'ios' && (
            <SettingsRow
              label={t('settings.apple_pay_shortcut', locale)}
              value={t('settings.set_up', locale)}
              onPress={() => Linking.openURL(SHORTCUT_INSTALL_URL)}
            />
          )}
          {Platform.OS === 'android' && (
            <>
              <View style={styles.automationRow}>
                <View style={styles.automationTextGroup}>
                  <Text style={styles.rowLabel}>{t('settings.payment_notifications', locale)}</Text>
                  <Text style={styles.automationHint}>
                    {t('settings.payment_notifications_hint', locale)}
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
                  {t('settings.notification_disclaimer_android', locale)}
                </Text>
              )}
            </>
          )}
          {Platform.OS === 'ios' && (
            <Text style={styles.automationDisclaimer}>
              {t('settings.shortcut_disclaimer_ios', locale)}
            </Text>
          )}
        </SettingsSection>

        {/* Developer */}
        <SettingsSection title={t('settings.developer', locale)}>
          <SettingsRow
            label={t('settings.ai_server_url', locale)}
            value={apiUrl}
            onPress={() => { setApiUrlInput(apiUrl); setApiUrlModal(true) }}
          />
        </SettingsSection>

        {/* About */}
        <SettingsSection title={t('settings.about', locale)}>
          <SettingsRow label={t('settings.version', locale)} value="1.0.0" />
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
              {t('settings.budget_hint', locale)}
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
            <Text style={styles.modalSectionLabel}>{t('settings.budget_period', locale)}</Text>
            <View style={styles.periodList}>
              {BUDGET_PERIODS.map((p, i) => (
                <View key={p.value}>
                  {i > 0 && <View style={styles.divider} />}
                  <Pressable
                    style={styles.periodRow}
                    onPress={() => setBudgetPeriod(p.value)}
                  >
                    <Text style={styles.periodLabel}>{t(p.key, locale)}</Text>
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
              <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('settings.ai_server_url', locale)}</Text>
            <Pressable onPress={async () => { await setApiUrl(apiUrlInput); setApiUrlModal(false) }}>
              <Text style={styles.modalDone}>{t('common.save', locale)}</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalHint}>
              {t('settings.ai_url_hint', locale)}
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
                {t('settings.reset_default', locale)}
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
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: 120 },
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
  rowChevron: { marginLeft: Spacing.sm },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 24,
    color: Colors.primary,
  },
  profileInfo: { flex: 1, gap: 2 },
  profileName: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.text,
  },
  profileEmail: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
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
  currencySymbol: { fontFamily: Typography.fontFamily.serif, fontSize: Typography.size.xl, fontWeight: '600', color: Colors.textSecondary },
  amountInput: { flex: 1, fontFamily: Typography.fontFamily.serif, fontSize: Typography.size['4xl'], fontWeight: '600', letterSpacing: -0.6, color: Colors.text },
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
