import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useCategories } from '../../src/hooks/useCategories'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useProfile } from '../../src/hooks/useProfile'
import { useVoice } from '../../src/hooks/useVoice'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { CategoryPicker } from '../../src/components/CategoryPicker'
import { VoiceWaveform } from '../../src/components/VoiceWaveform'
import { VoiceConfirmModal, type ConfirmedExpense } from '../../src/components/VoiceConfirmModal'
import { ListeningView } from '../../src/components/ListeningView'
import { RecurringToggle } from '../../src/components/RecurringToggle'
import { Colors, Typography, Text as TextStyles, Spacing, Radius, Hairline } from '../../src/theme'
import { parseScan } from '@voice-expense/ai'
import { supabase } from '../../src/lib/supabase'
import { getApiUrl } from '../../src/hooks/useApiUrl'
import { t } from '@voice-expense/shared'
import type { TransactionDirection, PaymentMethod, TransactionSource, Locale } from '@voice-expense/shared'
import type { RecurringFrequency } from '@voice-expense/shared'

const PAYMENT_METHODS: { value: PaymentMethod; key: string }[] = [
  { value: 'cash', key: 'payment.cash' },
  { value: 'credit_card', key: 'payment.credit_card' },
  { value: 'debit_card', key: 'payment.debit_card' },
  { value: 'digital_wallet', key: 'payment.digital_wallet' },
  { value: 'bank_transfer', key: 'payment.bank_transfer' },
]


type Tab = 'voice' | 'manual'

export default function RecordScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories, createCategory } = useCategories(user?.id)
  const { createTransaction } = useTransactions(user?.id)
  const { createRule } = useRecurringRules(user?.id)
  const router = useRouter()

  const userLocale = (profile?.locale ?? 'en') as Locale
  const userCurrency = profile?.currency_code ?? 'USD'

  // Map app locale to a valid BCP-47 tag for iOS/Android speech recognizer
  const LOCALE_TO_BCP47: Record<string, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    es: 'es-ES',
    pt: 'pt-BR',
  }
  const speechLocale = profile?.voice_language ?? LOCALE_TO_BCP47[userLocale] ?? 'en-US'
  const categoryNames = categories.map((c) => c.name)

  const voice = useVoice(userCurrency, categoryNames, userLocale)

  // Incoming shortcut deep-link params (voiceexpense://shortcut?amount=X&merchant=Y...)
  const params = useLocalSearchParams<{
    shortcut_amount?: string
    shortcut_merchant?: string
    shortcut_currency?: string
    shortcut_payment_method?: string
  }>()

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>('voice')
  const [confirmModalVisible, setConfirmModalVisible] = useState(false)
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [transactionSource, setTransactionSource] = useState<TransactionSource>('voice')

  // Handle incoming iOS Shortcut deep link — pre-fill confirm modal
  useEffect(() => {
    const amount = parseFloat(params.shortcut_amount ?? '')
    if (isNaN(amount) || amount <= 0) return
    setTransactionSource('shortcut')
    voice.injectParsed({
      amount,
      currency: params.shortcut_currency || userCurrency,
      direction: 'debit',
      merchant: params.shortcut_merchant || null,
      merchant_domain: null,
      category_suggestion: null,
      payment_method: (params.shortcut_payment_method as PaymentMethod) || 'digital_wallet',
      transacted_at: new Date().toISOString(),
      confidence: 1.0,
      needs_clarification: false,
      clarifying_question: null,
      is_recurring_suggestion: false,
      recurring_frequency_suggestion: null,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.shortcut_amount])

  // Manual entry state. `amount` is a string so the keypad can append
  // characters directly without parsing-round-trip jitter; handleManualSave
  // converts at save time via parseFloat.
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [direction, setDirection] = useState<TransactionDirection>('debit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [manualIsRecurring, setManualIsRecurring] = useState(false)
  const [manualRecurringFreq, setManualRecurringFreq] = useState<RecurringFrequency>('monthly')
  const [manualSaving, setManualSaving] = useState(false)
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)

  // On-screen keypad key handler — matches S_Keypad from
  // docs/money-app/project/mobile-screens-3.jsx.
  function handleKeypadPress(key: string) {
    if (key === '⌫') {
      setAmount((prev) => prev.slice(0, -1))
      return
    }
    if (key === '.') {
      // Only one decimal separator allowed; ignore otherwise.
      if (amount.includes('.')) return
      // Leading "." becomes "0." for readability.
      setAmount((prev) => (prev === '' ? '0.' : prev + '.'))
      return
    }
    // Digit. Block:
    //  - leading zeros (so "05" doesn't happen — "5" is correct)
    //  - more than 2 decimal places
    //  - absurdly long entries (caps at 10 chars incl. the decimal point)
    setAmount((prev) => {
      if (prev.length >= 10) return prev
      if (prev === '0' && key !== '.') return key
      const decIdx = prev.indexOf('.')
      if (decIdx >= 0 && prev.length - decIdx - 1 >= 2) return prev
      return prev + key
    })
  }

  // Show confirm modal when voice parsing finishes
  const handleMicPress = async () => {
    if (voice.state === 'listening') {
      voice.stopListening()
      return
    }
    if (voice.state === 'done') {
      setConfirmModalVisible(true)
      return
    }
    setTransactionSource('voice')
    await voice.startListening(speechLocale)
  }

  // When voice state reaches 'done', auto-open the confirm modal
  if (voice.state === 'done' && !confirmModalVisible) {
    setConfirmModalVisible(true)
  }

  async function handleConfirmVoice(expense: ConfirmedExpense) {
    setConfirmSaving(true)
    const { id: txnId, error } = await createTransaction({
      amount: expense.amount,
      direction: expense.direction,
      currency_code: expense.currency,
      merchant: expense.merchant,
      note: expense.note,
      category_id: expense.categoryId,
      merchant_domain: voice.parsedExpense?.merchant_domain ?? null,
      payment_method: voice.parsedExpense?.payment_method ?? 'cash',
      source: transactionSource,
      raw_transcript: voice.transcript || null,
      ai_confidence: voice.parsedExpense?.confidence ?? null,
      is_recurring: expense.isRecurring,
    })

    if (!error && expense.isRecurring && txnId) {
      await createRule({
        name: expense.merchant,
        amount: expense.amount,
        currency_code: expense.currency,
        category_id: expense.categoryId,
        direction: expense.direction,
        payment_method: voice.parsedExpense?.payment_method ?? null,
        note: expense.note,
        frequency: expense.recurringFrequency,
        template_txn_id: txnId,
      })
    }

    setConfirmSaving(false)

    if (error) {
      Alert.alert(t('common.error', userLocale), error)
    } else {
      setConfirmModalVisible(false)
      setTransactionSource('voice')
      voice.reset()
      router.push('/(tabs)')
    }
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
    setScanLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token ?? ''

      const apiBaseUrl = await getApiUrl()
      const parsed = await parseScan({
        imageBase64,
        scanType: type,
        currency: userCurrency,
        apiBaseUrl,
        authToken: token,
      })

      // Reuse the voice confirm modal with the scan result
      setTransactionSource('scan')
      voice.injectParsed(parsed)
      // state is now 'done' — the modal auto-opens via the auto-open check below
    } catch (err) {
      Alert.alert(t('voice.scan_failed', userLocale), err instanceof Error ? err.message : t('common.error', userLocale))
    } finally {
      setScanLoading(false)
    }
  }

  async function handleManualSave() {
    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(t('voice.invalid_amount', userLocale), t('voice.invalid_amount_msg', userLocale))
      return
    }
    if (!user) return

    setManualSaving(true)
    const { id: txnId, error } = await createTransaction({
      amount: parsedAmount,
      direction,
      currency_code: userCurrency,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      category_id: categoryId,
      payment_method: paymentMethod,
      is_recurring: manualIsRecurring,
    })

    if (!error && manualIsRecurring && txnId) {
      await createRule({
        name: merchant.trim() || null,
        amount: parsedAmount,
        currency_code: userCurrency,
        category_id: categoryId,
        direction,
        payment_method: paymentMethod,
        note: note.trim() || null,
        frequency: manualRecurringFreq,
        template_txn_id: txnId,
      })
    }

    setManualSaving(false)

    if (error) {
      Alert.alert(t('common.error', userLocale), error)
    } else {
      setAmount('')
      setMerchant('')
      setNote('')
      setCategoryId(null)
      setDirection('debit')
      setPaymentMethod('cash')
      setManualIsRecurring(false)
      setManualRecurringFreq('monthly')
      router.push('/(tabs)')
    }
  }

  const isListening = voice.state === 'listening'
  const isProcessing = voice.state === 'processing'

  // Full-screen listening/processing takeover — matches S_Listening in
  // docs/money-app/project/mobile-screens-1.jsx.
  if (isListening || isProcessing) {
    return (
      <ListeningView
        transcript={voice.interimTranscript || voice.transcript}
        detectedChips={[]}
        active={isListening}
        onCancel={() => { voice.reset(); router.push('/(tabs)') }}
        onStop={() => voice.stopListening()}
        locale={userLocale}
      />
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Page header: close + centered title */}
      <View style={styles.pageHeader}>
        <Pressable style={styles.closeBtn} onPress={() => router.push('/(tabs)')} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.pageTitle}>{t('voice.page_title', userLocale as any)}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tab toggle: Voice / Manual */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === 'voice' && styles.tabActive]}
          onPress={() => setActiveTab('voice')}
        >
          <Text style={[styles.tabLabel, activeTab === 'voice' && styles.tabLabelActive]}>
            {t('voice.tab_voice', userLocale as any)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'manual' && styles.tabActive]}
          onPress={() => setActiveTab('manual')}
        >
          <Text style={[styles.tabLabel, activeTab === 'manual' && styles.tabLabelActive]}>
            {t('voice.tab_manual', userLocale as any)}
          </Text>
        </Pressable>
      </View>

      {activeTab === 'voice' ? (
        /* ── VOICE TAB ── */
        <View style={styles.voiceContainer}>
          <View style={styles.voiceHeading}>
            <Text style={styles.voiceTitle}>{t('voice.title', userLocale as any)}</Text>
            <Text style={styles.voiceSubtitle}>{t('voice.subtitle', userLocale as any)}</Text>
          </View>

          <View style={styles.transcriptBox}>
            <Text style={[styles.transcriptText, !(voice.transcript || voice.interimTranscript) && styles.transcriptPlaceholder]}>
              {voice.transcript || voice.interimTranscript
                ? `"${voice.transcript || voice.interimTranscript}"`
                : t('voice.transcript_placeholder', userLocale as any)}
            </Text>
          </View>

          <View style={styles.waveformContainer}>
            <VoiceWaveform active={isListening} />
          </View>

          {isProcessing && (
            <View style={styles.processingRow}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.processingText}>{t('voice.parsing', userLocale as any)}</Text>
            </View>
          )}

          {voice.state === 'error' && (
            <Text style={styles.errorText}>{voice.errorMessage ?? t('common.error', userLocale)}</Text>
          )}

          <Pressable
            style={[
              styles.micButton,
              isListening && styles.micButtonActive,
              isProcessing && styles.micButtonDisabled,
            ]}
            onPress={handleMicPress}
            disabled={isProcessing}
          >
            <Ionicons
              name={isListening ? 'stop' : 'mic'}
              size={36}
              color={Colors.white}
            />
          </Pressable>

          <Text style={styles.tapToStop}>
            {isListening ? t('voice.tap_to_stop', userLocale as any) : t('voice.tap_to_record', userLocale as any)}
          </Text>

          <View style={styles.scanRow}>
              <Pressable
                style={styles.scanButton}
                onPress={() => handleScan('receipt')}
                disabled={scanLoading}
              >
                {scanLoading ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <>
                    <Ionicons name="scan-outline" size={18} color={Colors.primary} />
                    <Text style={styles.scanLabel}>{t('voice.scan_receipt', userLocale as any)}</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={styles.scanButton}
                onPress={() => handleScan('paycheck')}
                disabled={scanLoading}
              >
                <Ionicons name="card-outline" size={18} color={Colors.primary} />
                <Text style={styles.scanLabel}>{t('voice.scan_paycheck', userLocale as any)}</Text>
              </Pressable>
          </View>
        </View>
      ) : (
        /* ── MANUAL TAB — S_Keypad layout from mobile-screens-3.jsx ── */
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.manualContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Direction segmented control. Kept — S_Keypad only shows a
                one-way expense flow but we support both (non-regression). */}
            <View style={styles.directionRow}>
              <Pressable
                style={[styles.directionBtn, direction === 'debit' && styles.directionBtnActive]}
                onPress={() => setDirection('debit')}
              >
                <Text style={[styles.directionLabel, direction === 'debit' && styles.directionLabelActive]}>
                  {t('voice.expense', userLocale as any)}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.directionBtn, direction === 'credit' && styles.directionBtnActiveIncome]}
                onPress={() => setDirection('credit')}
              >
                <Text style={[styles.directionLabel, direction === 'credit' && styles.directionLabelActiveIncome]}>
                  {t('voice.income_label', userLocale as any)}
                </Text>
              </Pressable>
            </View>

            {/* Hero amount — 80px serif, driven by the on-screen keypad */}
            <View style={styles.amountHero}>
              <Text style={styles.amountHeroText} numberOfLines={1} adjustsFontSizeToFit>
                {amount === ''
                  ? <Text style={styles.amountHeroPlaceholder}>0</Text>
                  : amount}
              </Text>
              <Text style={styles.amountHeroCurrency}>{userCurrency}</Text>
            </View>

            {/* Quick fields — merchant (single line) + category chip trigger */}
            <View style={styles.quickFields}>
              <TextInput
                style={styles.quickInput}
                value={merchant}
                onChangeText={setMerchant}
                placeholder={t('voice.merchant_source', userLocale as any)}
                placeholderTextColor={Colors.textMuted}
              />
              <View style={styles.quickCategoryWrap}>
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                  onCreateCategory={createCategory}
                  locale={userLocale}
                />
              </View>
            </View>

            {/* 3x4 keypad — 1-9, ., 0, ⌫ */}
            <View style={styles.keypad}>
              {[['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']].map((row, r) => (
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

            {/* More options expander — note, payment method, recurring */}
            <Pressable
              onPress={() => setMoreOptionsOpen((v) => !v)}
              style={({ pressed }) => [styles.moreOptionsToggle, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Text style={styles.moreOptionsLabel}>
                {t('voice.more_options', userLocale as any)}
              </Text>
              <Ionicons
                name={moreOptionsOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.ink3 ?? Colors.textSecondary}
              />
            </Pressable>

            {moreOptionsOpen && (
              <View style={styles.moreOptionsPanel}>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('voice.note', userLocale as any)}</Text>
                  <TextInput
                    style={styles.input}
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('voice.note_placeholder', userLocale as any)}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>{t('voice.payment_method', userLocale as any)}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipRow}>
                      {PAYMENT_METHODS.map((m) => (
                        <Pressable
                          key={m.value}
                          style={[styles.chip, paymentMethod === m.value && styles.chipActive]}
                          onPress={() => setPaymentMethod(m.value)}
                        >
                          <Text style={[styles.chipLabel, paymentMethod === m.value && styles.chipLabelActive]}>
                            {t(m.key, userLocale as any)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <RecurringToggle
                  isRecurring={manualIsRecurring}
                  frequency={manualRecurringFreq}
                  onToggle={setManualIsRecurring}
                  onFrequencyChange={setManualRecurringFreq}
                  locale={userLocale}
                />
              </View>
            )}

            {/* Dark ink CTA — "Add expense" / "Add income" per direction */}
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                (manualSaving || amount === '') && styles.addButtonDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleManualSave}
              disabled={manualSaving || amount === ''}
            >
              {manualSaving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.addButtonText}>
                  {direction === 'debit'
                    ? t('voice.add_expense', userLocale as any)
                    : t('voice.add_income', userLocale as any)}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* Voice confirm modal — shared for voice + scan */}
      <VoiceConfirmModal
        visible={confirmModalVisible}
        transcript={voice.transcript}
        parsedExpense={voice.parsedExpense}
        categories={categories}
        onCreateCategory={createCategory}
        onConfirm={handleConfirmVoice}
        onDismiss={() => {
          setConfirmModalVisible(false)
          setTransactionSource('voice')
          voice.reset()
        }}
        saving={confirmSaving}
        locale={userLocale}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  pageTitle: TextStyles.navTitle,
  transcriptPlaceholder: {
    color: Colors.textMuted,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.full ?? 999,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'center',
  },
  tab: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.full ?? 999 },
  tabActive: { backgroundColor: Colors.primary },
  tabLabel: {
    ...TextStyles.buttonSecondary,
    textAlign: 'center',
  },
  tabLabelActive: { color: Colors.white },

  // Voice tab
  voiceContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: 110,
    justifyContent: 'space-evenly',
  },
  voiceHeading: {
    alignItems: 'center',
  },
  voiceTitle: {
    ...TextStyles.h1,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  voiceSubtitle: {
    ...TextStyles.subtitle,
    textAlign: 'center',
  },
  transcriptBox: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.base,
    alignSelf: 'stretch',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  transcriptText: {
    ...TextStyles.transcript,
    textAlign: 'center',
    lineHeight: 20,
  },
  waveformContainer: { height: 48, justifyContent: 'center' },
  processingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  processingText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  errorText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.destructive,
    textAlign: 'center',
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  micButtonActive: { backgroundColor: Colors.destructive, shadowColor: Colors.destructive },
  micButtonDisabled: { opacity: 0.5 },
  micIcon: { fontSize: 28 },
  tapToStop: TextStyles.hint,
  scanRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  scanButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
    minHeight: 48,
  },
  scanLabelWrap: {
    flexShrink: 1,
  },
  scanIcon: { fontSize: 16 },
  scanLabel: {
    ...TextStyles.button,
    color: Colors.primary,
    textAlign: 'center',
    flexShrink: 1,
  },

  // Manual tab
  manualContent: { padding: Spacing.base, gap: Spacing.base, paddingBottom: 120 },
  directionRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  directionBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
  directionBtnActive: { backgroundColor: Colors.expense },
  directionBtnActiveIncome: { backgroundColor: Colors.income },
  directionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  directionLabelActive: { color: Colors.white },
  directionLabelActiveIncome: { color: Colors.white },
  // S_Keypad hero: 80px serif amount centered, currency code tucked underneath.
  amountHero: {
    alignItems: 'center',
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  amountHeroText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 80,
    fontWeight: '500',
    letterSpacing: -1.5,
    lineHeight: 88,
    color: Colors.ink ?? Colors.text,
  },
  amountHeroPlaceholder: {
    color: Colors.ink3 ?? Colors.textSecondary,
    opacity: 0.55,
  },
  amountHeroCurrency: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 2,
  },

  // Merchant input + category chip trigger row
  quickFields: {
    gap: Spacing.sm,
  },
  quickInput: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 16,
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink ?? Colors.text,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  quickCategoryWrap: {
    // CategoryPicker supplies its own trigger; this wrapper just aligns it
    // visually with the merchant row above.
  },

  // 3×4 on-screen keypad (1-9, ., 0, ⌫) — replaces the native decimal-pad
  // so the amount entry matches S_Keypad's visual rhythm.
  keypad: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  keypadRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  keypadKey: {
    flex: 1,
    height: 56,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  keypadKeyPressed: { opacity: 0.55 },
  keypadKeyText: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 28,
    fontWeight: '500',
    color: Colors.ink ?? Colors.text,
  },

  // "More options" chevron that reveals note / payment / recurring
  moreOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  moreOptionsLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  moreOptionsPanel: {
    gap: Spacing.base,
    paddingTop: Spacing.xs,
  },

  // Dark ink "Add expense" / "Add income" CTA — matches the S_Keypad button
  addButton: {
    backgroundColor: Colors.ink ?? '#1B1915',
    borderRadius: 28,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    marginTop: Spacing.sm,
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  fields: { gap: Spacing.base },
  field: { gap: Spacing.xs },
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
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
