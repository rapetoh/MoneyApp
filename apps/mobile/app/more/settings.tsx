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
import * as Linking from 'expo-linking'
import { useAuth, signOut } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useActiveBudget } from '../../src/hooks/useBudget'
import { useNotificationListener } from '../../src/hooks/useNotificationListener'
import { useApiUrl } from '../../src/hooks/useApiUrl'
import { SetGroup, SetRow } from '../../src/components/SettingsList'
import { BudgetEditorModal } from '../../src/components/BudgetEditorModal'
import { Colors, Typography, Radius, Hairline } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'
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
  const { profile, updateProfile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const { budget, setBudget } = useActiveBudget(user?.id)
  const router = useRouter()

  const [budgetModal, setBudgetModal] = useState(false)
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

  const periodKey =
    BUDGET_PERIODS.find((p) => p.value === (budget?.period ?? 'monthly'))?.key ??
    'settings.period_monthly'
  const periodLabel = t(periodKey, locale)
  const budgetDisplay = budget ? `${currency} ${budget.amount.toFixed(0)} / ${periodLabel}` : '—'

  const txnCount = transactions.filter((x) => !x.is_deleted).length
  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? '—'
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
  }, [permissionGranted, requestPermission, recheckPermission, locale])

  const SHORTCUT_INSTALL_URL = 'https://www.icloud.com/shortcuts/placeholder'

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile card — matches S_Settings avatar + Upgrade pill */}
        <View style={styles.profileWrap}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.profilePlan} numberOfLines={1}>
                {t('settings.plan_free', locale)} · {txnCount} {t('settings.expenses_count', locale)}
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.upgradePill, pressed && styles.upgradePillPressed]}
              onPress={() => router.push('/more/paywall')}
            >
              <Text style={styles.upgradePillText}>{t('settings.upgrade', locale)}</Text>
            </Pressable>
          </View>
        </View>

        {/* Account */}
        <SetGroup label={t('settings.account', locale)}>
          <SetRow label={t('auth.email', locale)} detail={user?.email ?? '—'} chevron={false} />
          <SetRow
            label={t('settings.display_name', locale)}
            detail={profile?.display_name ?? '—'}
            onPress={() => {
              setNameInput(profile?.display_name ?? '')
              setNameModal(true)
            }}
            last
          />
        </SetGroup>

        {/* Voice & capture */}
        <SetGroup label={t('settings.voice_capture', locale)}>
          <SetRow
            label={t('settings.voice_engine', locale)}
            detail={t('settings.voice_engine_on_device', locale)}
            chevron={false}
          />
          <SetRow
            label={t('settings.language', locale)}
            detail={localeName}
            onPress={() => setLocaleModal(true)}
            last
          />
        </SetGroup>

        {/* Preferences */}
        <SetGroup label={t('settings.preferences', locale)}>
          <SetRow
            label={t('settings.income', locale)}
            detail={budgetDisplay}
            onPress={() => setBudgetModal(true)}
          />
          <SetRow
            label={t('settings.currency', locale)}
            detail={currency}
            onPress={() => setCurrencyModal(true)}
          />
          <SetRow
            label={t('settings.recurring', locale)}
            onPress={() => router.push('/recurring')}
            last
          />
        </SetGroup>

        {/* Automations (platform-specific) */}
        <SetGroup label={t('settings.automations', locale)}>
          {Platform.OS === 'ios' ? (
            <SetRow
              label={t('settings.apple_pay_shortcut', locale)}
              detail={t('settings.set_up', locale)}
              onPress={() => Linking.openURL(SHORTCUT_INSTALL_URL)}
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

        {/* Privacy */}
        <SetGroup label={t('settings.privacy', locale)}>
          <SetRow
            label={t('more.privacy', locale)}
            detail={t('settings.review', locale)}
            onPress={() => router.push('/more/privacy')}
            last
          />
        </SetGroup>

        {/* Developer */}
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

        {/* About */}
        <SetGroup label={t('settings.about', locale)}>
          <SetRow
            label={t('more.help', locale)}
            onPress={() => router.push('/more/help')}
          />
          <SetRow label={t('settings.version', locale)} detail="1.0.0" chevron={false} last />
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
              {i > 0 && <View style={styles.rowDivider} />}
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

      {/* API URL modal */}
      <Modal visible={apiUrlModal} animationType="slide" presentationStyle="pageSheet">
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
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
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
})
