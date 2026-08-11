import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useCategories } from '../../src/hooks/useCategories'
import { useTransactions, deleteTransactionAndEnqueue } from '../../src/hooks/useTransactions'
import { useProfile } from '../../src/hooks/useProfile'
import { useUndo } from '../../src/hooks/useUndo'
import { useVoiceSession } from '../../src/hooks/useVoiceSession'
import { CategoryPicker } from '../../src/components/CategoryPicker'
import { RecurringToggle } from '../../src/components/RecurringToggle'
import { BottomSheet } from '../../src/components/BottomSheet'
import { Colors, Typography, Text as TextStyles, Spacing, Radius, Hairline } from '../../src/theme'
import { parseScan } from '@voice-expense/ai'
import { supabase } from '../../src/lib/supabase'
import { getApiUrl } from '../../src/hooks/useApiUrl'
import { t, currencySymbolFor, formatMoney, validateAmount } from '@voice-expense/shared'
import type { TransactionDirection, PaymentMethod, Locale, AmountValidation } from '@voice-expense/shared'
import type { RecurringFrequency } from '@voice-expense/shared'

const PAYMENT_METHODS: { value: PaymentMethod; key: string }[] = [
  { value: 'cash', key: 'payment.cash' },
  { value: 'credit_card', key: 'payment.credit_card' },
  { value: 'debit_card', key: 'payment.debit_card' },
  { value: 'digital_wallet', key: 'payment.digital_wallet' },
  { value: 'bank_transfer', key: 'payment.bank_transfer' },
]

/** Maps `validateAmount`'s typed rejection reason to a localized message —
 *  see the identical helper the old Record screen carried (fix-plan 2.14). */
function amountErrorMessage(reason: Extract<AmountValidation, { ok: false }>['reason'], locale: Locale): string {
  switch (reason) {
    case 'too_large':
      return t('voice.amount_too_large', locale)
    case 'too_many_decimals':
      return t('voice.amount_too_many_decimals', locale)
    default:
      return t('voice.invalid_amount_msg', locale)
  }
}

/**
 * Quick entry — artboard 11 of docs/voice redesign. The manual keypad flow
 * that used to live as the "Manual" tab inside the Record screen, now a
 * standalone modal reached from the + button on Today's header (and from
 * the keyboard button inside the voice overlay). Receipt/paycheck scan
 * lives here too — scans parse into the same root-level result sheet the
 * voice flow uses.
 */
export default function QuickEntryScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories, createCategory } = useCategories(user?.id)
  const { createTransaction } = useTransactions(user?.id)
  const { showUndo } = useUndo()
  const { openVoice, presentParsed } = useVoiceSession()
  const router = useRouter()

  const userLocale = (profile?.locale ?? 'en') as Locale
  const userCurrency = profile?.currency_code ?? 'USD'

  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [direction, setDirection] = useState<TransactionDirection>('debit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringFreq, setRecurringFreq] = useState<RecurringFrequency>('monthly')
  const [saving, setSaving] = useState(false)
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [scanningType, setScanningType] = useState<'receipt' | 'paycheck' | null>(null)

  function handleKeypadPress(key: string) {
    setAmount((prev) => {
      if (key === '⌫') return prev.slice(0, -1)
      if (key === '.') {
        if (prev.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      }
      if (prev.length >= 10) return prev
      if (prev === '0') return key
      const decIdx = prev.indexOf('.')
      if (decIdx >= 0 && prev.length - decIdx - 1 >= 2) return prev
      return prev + key
    })
  }

  function switchToVoice() {
    // The voice overlay is a root-level layer, which iOS draws *behind* a
    // native modal — dismiss this modal first, then open the overlay.
    router.navigate('/(tabs)')
    openVoice()
  }

  async function handleScan(type: 'receipt' | 'paycheck') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync()
    if (!granted) {
      Alert.alert(t('voice.permission_required', userLocale), t('voice.camera_permission', userLocale))
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
      allowsEditing: false,
    })

    if (result.canceled || !result.assets[0]?.base64) return

    const imageBase64 = result.assets[0].base64
    setScanningType(type)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token ?? ''

      const apiBaseUrl = await getApiUrl()
      const scanResult = await parseScan({
        imageBase64,
        scanType: type,
        currency: userCurrency,
        apiBaseUrl,
        authToken: token,
      })

      if (!scanResult.ok) {
        // A scan the model couldn't read never opens the confirm sheet
        // (fix-plan 2.9c) — message + a way forward, no editor. The old
        // "Enter manually" option is gone because this screen IS manual
        // entry now.
        Alert.alert(t('voice.scan_rejected_title', userLocale), scanResult.reason, [
          { text: t('voice.retake', userLocale), onPress: () => handleScan(type) },
          { text: t('common.cancel', userLocale), style: 'cancel' },
        ])
        return
      }

      // Same layering rule as switchToVoice: the result sheet lives at the
      // root, so dismiss this native modal and let the sheet rise over
      // Today (exactly the 14b pattern).
      presentParsed(scanResult.expense, 'scan')
      router.navigate('/(tabs)')
    } catch (err) {
      Alert.alert(t('voice.scan_failed', userLocale), err instanceof Error ? err.message : t('common.error', userLocale))
    } finally {
      setScanningType(null)
    }
  }

  async function handleSave() {
    const validation = validateAmount(amount, userCurrency)
    if (!validation.ok) {
      Alert.alert(t('voice.invalid_amount', userLocale), amountErrorMessage(validation.reason, userLocale))
      return
    }
    if (!user) return

    setSaving(true)
    const result = await createTransaction({
      amount: validation.amount,
      direction,
      currency_code: userCurrency,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      category_id: categoryId,
      payment_method: paymentMethod,
      is_recurring: isRecurring,
      recurring_frequency: isRecurring ? recurringFreq : null,
    })
    setSaving(false)

    if (result.error && result.status === 'rejected') {
      Alert.alert(t('common.error', userLocale), result.error)
      return
    }

    // Saved-with-undo snackbar (artboard 15) — every save path gets one now.
    const savedId = result.id
    const userId = user.id
    const label = merchant.trim()
      || categories.find((c) => c.id === categoryId)?.name
      || t(direction === 'credit' ? 'voice.income_label' : 'voice.expense', userLocale)
    showUndo({
      message: `${t('voice.saved', userLocale)} · ${label} ${formatMoney(validation.amount, userCurrency, userLocale)}`,
      undoLabel: t('common.undo', userLocale),
      undo: async () => {
        if (savedId) await deleteTransactionAndEnqueue(userId, savedId)
      },
    })
    router.navigate('/(tabs)')
  }

  const canSave = validateAmount(amount, userCurrency).ok

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header — Cancel · Quick entry · mic (artboard 11) */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button">
          <Text style={styles.headerCancel}>{t('common.cancel', userLocale)}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t('voice.quick_entry', userLocale)}</Text>
        <Pressable
          style={({ pressed }) => [styles.headerMic, pressed && { opacity: 0.7 }]}
          onPress={switchToVoice}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('voice.tap_to_record', userLocale)}
        >
          <Ionicons name="mic" size={18} color={Colors.accent} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <ScrollView
          style={styles.topClusterScroll}
          contentContainerStyle={styles.topCluster}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount card — direction toggle + serif hero */}
          <View style={styles.amountCard}>
            <View style={styles.directionRow}>
              <Pressable
                style={[styles.directionBtn, direction === 'debit' && styles.directionBtnActive]}
                onPress={() => setDirection('debit')}
              >
                <Text style={[styles.directionLabel, direction === 'debit' && styles.directionLabelActive]}>
                  {t('voice.expense', userLocale)}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.directionBtn, direction === 'credit' && styles.directionBtnActiveIncome]}
                onPress={() => setDirection('credit')}
              >
                <Text style={[styles.directionLabel, direction === 'credit' && styles.directionLabelActiveIncome]}>
                  {t('voice.income_label', userLocale)}
                </Text>
              </Pressable>
            </View>

            {amount === '' ? (
              <Text style={[styles.amountHeroText, styles.amountHeroPlaceholder]} numberOfLines={1}>
                0
              </Text>
            ) : (
              <Text style={styles.amountHeroText} numberOfLines={1} ellipsizeMode="clip">
                {amount}
              </Text>
            )}
            <Text style={styles.amountHeroCurrency}>{currencySymbolFor(userCurrency)}</Text>
          </View>

          {/* Merchant + category + recurring */}
          <View style={styles.quickFields}>
            <TextInput
              style={styles.quickInput}
              value={merchant}
              onChangeText={setMerchant}
              placeholder={t('voice.merchant_source', userLocale)}
              placeholderTextColor={Colors.textMuted}
            />
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              onCreateCategory={createCategory}
              locale={userLocale}
            />
            <RecurringToggle
              isRecurring={isRecurring}
              frequency={recurringFreq}
              onToggle={setIsRecurring}
              onFrequencyChange={setRecurringFreq}
              locale={userLocale}
              variant="compact"
            />
          </View>

          {/* Receipt / paycheck scan — parses into the shared result sheet */}
          <View style={styles.scanRow}>
            <Pressable
              style={[styles.scanButton, scanningType !== null && styles.scanButtonDisabled]}
              onPress={() => handleScan('receipt')}
              disabled={scanningType !== null}
            >
              {scanningType === 'receipt' ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="scan-outline" size={18} color={Colors.primary} />
                  <Text style={styles.scanLabel}>{t('voice.scan_receipt', userLocale)}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.scanButton, scanningType !== null && styles.scanButtonDisabled]}
              onPress={() => handleScan('paycheck')}
              disabled={scanningType !== null}
            >
              {scanningType === 'paycheck' ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={18} color={Colors.primary} />
                  <Text style={styles.scanLabel}>{t('voice.scan_paycheck', userLocale)}</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>

        {/* Keypad + Add CTA, anchored to the bottom */}
        <View style={styles.bottomCluster}>
          <View style={styles.keypad}>
            {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', '⌫']].map((row, r) => (
              <View key={r} style={styles.keypadRow}>
                {row.map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => handleKeypadPress(k)}
                    style={({ pressed }) => [styles.keypadKey, pressed && styles.keypadKeyPressed]}
                  >
                    <Text style={styles.keypadKeyText}>{k}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <View style={styles.footerRow}>
            <Pressable
              onPress={() => setMoreOptionsOpen(true)}
              style={({ pressed }) => [styles.moreOptionsButton, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="options-outline" size={16} color={Colors.ink3} />
              <Text style={styles.moreOptionsLabel}>{t('voice.more_options', userLocale)}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                (saving || !canSave) && styles.addButtonDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleSave}
              disabled={saving || !canSave}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.addButtonText}>
                  {direction === 'debit'
                    ? t('voice.add_expense', userLocale)
                    : t('voice.add_income', userLocale)}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Advanced fields — note + payment method */}
      <BottomSheet
        visible={moreOptionsOpen}
        onClose={() => setMoreOptionsOpen(false)}
        title={t('voice.more_options', userLocale)}
        cancelLabel=""
        headerRight={
          <Pressable onPress={() => setMoreOptionsOpen(false)} hitSlop={10}>
            <Text style={styles.moreOptionsDone}>{t('common.done', userLocale)}</Text>
          </Pressable>
        }
        contentContainerStyle={styles.moreOptionsContent}
        testID="quick-entry-more-options-sheet"
      >
        <View style={styles.field}>
          <Text style={styles.label}>{t('voice.note', userLocale)}</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder={t('voice.note_placeholder', userLocale)}
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('voice.payment_method', userLocale)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map((m) => (
                <Pressable
                  key={m.value}
                  style={[styles.chip, paymentMethod === m.value && styles.chipActive]}
                  onPress={() => setPaymentMethod(m.value)}
                >
                  <Text style={[styles.chipLabel, paymentMethod === m.value && styles.chipLabelActive]}>
                    {t(m.key, userLocale)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  headerCancel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink3,
  },
  // The one nav-title in this screen — the design system's preset, not a
  // hand-assembled copy (typography.ts: "use these instead").
  headerTitle: TextStyles.navTitle,
  headerMic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingTop: 4,
    paddingBottom: Spacing.sm,
    justifyContent: 'space-between',
  },
  topClusterScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  topCluster: {
    gap: 8,
  },
  bottomCluster: {
    gap: 8,
  },
  directionRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: Radius.full,
    padding: 3,
    alignSelf: 'center',
  },
  directionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  directionBtnActive: { backgroundColor: Colors.expense },
  directionBtnActiveIncome: { backgroundColor: Colors.income },
  directionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  directionLabelActive: { color: Colors.white },
  directionLabelActiveIncome: { color: Colors.white },
  amountCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  amountHeroText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 56,
    fontWeight: '600',
    letterSpacing: -0.5,
    lineHeight: 64,
    color: Colors.ink,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  amountHeroPlaceholder: {
    color: Colors.ink3,
    opacity: 0.55,
  },
  amountHeroCurrency: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3,
    marginTop: 2,
  },
  quickFields: {
    gap: Spacing.xs,
  },
  quickInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  scanRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 2,
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  scanButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
    minHeight: 44,
  },
  scanButtonDisabled: { opacity: 0.55 },
  scanLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
    flexShrink: 1,
  },
  keypad: {
    gap: 5,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: 5,
  },
  keypadKey: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  keypadKeyPressed: { opacity: 0.55 },
  keypadKeyText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    fontWeight: '500',
    color: Colors.ink,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  moreOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  moreOptionsLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink3,
  },
  moreOptionsDone: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.accent,
  },
  moreOptionsContent: {
    padding: Spacing.base,
    gap: Spacing.base,
  },
  addButton: {
    flex: 1,
    backgroundColor: Colors.ink,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  field: { gap: Spacing.xs },
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  input: {
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
  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  chipLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
})
