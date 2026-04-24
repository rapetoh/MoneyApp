import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
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
    /** Optional initial tab — "manual" lands the user on the keypad
        directly (used by the Day-1 coach's "Or type instead" link). */
    tab?: string
    /** Uniqueness token bumped on every Type-instead tap. Without it,
        a repeat tap with identical pathname+params is deduped by
        expo-router and the useFocusEffect below doesn't re-fire. */
    _nonce?: string
  }>()

  // UI state. The initial tab defaults to Voice; useFocusEffect below
  // overrides it based on the `?tab` param on every focus event.
  const [activeTab, setActiveTab] = useState<Tab>('voice')

  // Sync the tab with the route's ?tab param every time this screen gains
  // focus. The Record tab stays mounted across navigations, so a plain
  // useState initializer only runs once — meaning "tap Type instead" on
  // later visits would have no effect, and Voice/Manual would drift into
  // whatever state the user last left it in. useFocusEffect re-runs on
  // every focus (tab bar FAB, Type-instead, deep link), which is the
  // right granularity for this sync.
  //
  //   - tab=manual → switch to Manual (used by Day-1 coach's "type instead")
  //   - any other value or missing → reset to Voice (the FAB's default)
  useFocusEffect(
    useCallback(() => {
      setActiveTab(params.tab === 'manual' ? 'manual' : 'voice')
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.tab, params._nonce]),
  )
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
    setAmount((prev) => {
      if (key === '⌫') return prev.slice(0, -1)
      if (key === '.') {
        if (prev.includes('.')) return prev
        return prev === '' ? '0.' : prev + '.'
      }
      // Digit
      if (prev.length >= 10) return prev
      if (prev === '0') return key // replace leading zero
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
            <Text style={styles.errorText}>
              {voice.errorMessage === 'no-transcript'
                ? t('voice.no_transcript', userLocale as any)
                : voice.errorMessage ?? t('common.error', userLocale)}
            </Text>
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
        /* ── MANUAL TAB — S_Keypad layout, pinned to bottom.
            No KeyboardAvoidingView; merchant's native keyboard covers the
            keypad area (not the merchant input itself), which is fine. */
        <View style={styles.manualContainer}>
          {/* Top cluster — anchored to top of container via space-between */}
          <View style={styles.topCluster}>
          {/* Amount card — direction toggle + amount hero in one surface */}
          <View style={styles.amountCard}>
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

            {amount === '' ? (
              <Text style={[styles.amountHeroText, styles.amountHeroPlaceholder]} numberOfLines={1}>
                0
              </Text>
            ) : (
              <Text style={styles.amountHeroText} numberOfLines={1} ellipsizeMode="clip">
                {amount}
              </Text>
            )}
            <Text style={styles.amountHeroCurrency}>{userCurrency}</Text>
          </View>

          {/* Quick fields — merchant + category, compact */}
          <View style={styles.quickFields}>
            <TextInput
              style={styles.quickInput}
              value={merchant}
              onChangeText={setMerchant}
              placeholder={t('voice.merchant_source', userLocale as any)}
              placeholderTextColor={Colors.textMuted}
            />
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              onCreateCategory={createCategory}
              locale={userLocale}
            />
          </View>
          </View>

          {/* Bottom cluster — keypad + Add CTA, anchored to bottom of
              container by space-between on the parent. */}
          <View style={styles.bottomCluster}>
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

          {/* Footer row: "More options" (opens a modal sheet) + Add CTA */}
          <View style={styles.footerRow}>
            <Pressable
              onPress={() => setMoreOptionsOpen(true)}
              style={({ pressed }) => [styles.moreOptionsButton, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={Colors.ink3 ?? Colors.textSecondary}
              />
              <Text style={styles.moreOptionsLabel}>
                {t('voice.more_options', userLocale as any)}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                (manualSaving || !(parseFloat(amount) > 0)) && styles.addButtonDisabled,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleManualSave}
              disabled={manualSaving || !(parseFloat(amount) > 0)}
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
          </View>
          </View>

          {/* Bottom-sheet modal for advanced fields — kept out of the primary
              entry surface so the keypad never scrolls off screen. */}
          <Modal
            visible={moreOptionsOpen}
            animationType="slide"
            transparent
            onRequestClose={() => setMoreOptionsOpen(false)}
          >
            <Pressable
              style={styles.moreOptionsBackdrop}
              onPress={() => setMoreOptionsOpen(false)}
            >
              <Pressable style={styles.moreOptionsSheet} onPress={(e) => e.stopPropagation()}>
                <View style={styles.moreOptionsHeader}>
                  <Text style={styles.moreOptionsTitle}>
                    {t('voice.more_options', userLocale as any)}
                  </Text>
                  <Pressable onPress={() => setMoreOptionsOpen(false)} hitSlop={10}>
                    <Text style={styles.moreOptionsDone}>{t('common.done', userLocale as any)}</Text>
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={styles.moreOptionsContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
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
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
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

  // Manual tab — flex layout, no scroll. Content is sized to fit in one
  // viewport above the tab bar. Bottom padding reserves room for the
  // translucent tab bar + FAB cluster (~110pt) so the Add button never
  // sits under the bar.
  // Manual layout: two clusters, one anchored to top and one to bottom
  // via space-between. Fixed 120pt paddingBottom clears the absolute tab
  // bar (height 68, bottom 14) + the record FAB's protrusion/shadow on
  // every supported iPhone.
  manualContainer: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingTop: 4,
    paddingBottom: 120,
    justifyContent: 'space-between',
  },
  topCluster: {
    gap: 8,
  },
  bottomCluster: {
    gap: 8,
  },
  // Direction toggle — lives inside the amount card, transparent background
  // so the card's own surface carries the visual weight.
  directionRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: Radius.full ?? 999,
    padding: 3,
    alignSelf: 'center',
  },
  directionBtn: {
    paddingVertical: 5,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderRadius: Radius.full ?? 999,
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
  // Amount card — direction toggle + big serif amount in a single surface.
  // Fixed height so the content below (merchant, category, keypad, footer)
  // sits in predictable positions regardless of screen size.
  amountCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    backgroundColor: Colors.surface ?? Colors.card,
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
    color: Colors.ink ?? Colors.text,
    textAlign: 'center',
    // Tabular-nums keeps digits the same width so "11" doesn't jump as you type.
    fontVariant: ['tabular-nums'],
  },
  amountHeroPlaceholder: {
    color: Colors.ink3 ?? Colors.textSecondary,
    opacity: 0.55,
  },
  amountHeroCurrency: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 2,
  },

  // Merchant input + category picker trigger, stacked compact
  quickFields: {
    gap: Spacing.xs,
  },
  quickInput: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink ?? Colors.text,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },

  // 3×4 on-screen keypad — compacted so the whole Manual surface fits in
  // one viewport (48pt keys, 6pt gaps). Replaces the native decimal-pad.
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
    backgroundColor: Colors.surface ?? Colors.card,
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
    color: Colors.ink ?? Colors.text,
  },

  // Footer row: "More options" (left, opens bottom-sheet) + Add CTA (right)
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
    backgroundColor: Colors.surface ?? Colors.card,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
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

  // Bottom-sheet modal for advanced fields — keeps them out of the
  // primary entry surface so the keypad never scrolls off screen.
  moreOptionsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  moreOptionsSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  moreOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  moreOptionsTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink ?? Colors.text,
  },
  moreOptionsDone: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.accent ?? Colors.primary,
  },
  moreOptionsContent: {
    padding: Spacing.base,
    gap: Spacing.base,
  },

  // Dark ink "Add expense" / "Add income" CTA — fills remaining width next
  // to the More options pill on the footer row.
  addButton: {
    flex: 1,
    backgroundColor: Colors.ink ?? '#1B1915',
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
