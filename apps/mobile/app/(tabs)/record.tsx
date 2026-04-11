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
import * as ImagePicker from 'expo-image-picker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useCategories } from '../../src/hooks/useCategories'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useProfile } from '../../src/hooks/useProfile'
import { useVoice } from '../../src/hooks/useVoice'
import { CategoryPicker } from '../../src/components/CategoryPicker'
import { VoiceWaveform } from '../../src/components/VoiceWaveform'
import { VoiceConfirmModal, type ConfirmedExpense } from '../../src/components/VoiceConfirmModal'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { parseScan } from '@voice-expense/ai'
import { supabase } from '../../src/lib/supabase'
import { getApiUrl } from '../../src/hooks/useApiUrl'
import { t } from '@voice-expense/shared'
import type { TransactionDirection, PaymentMethod, TransactionSource } from '@voice-expense/shared'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'digital_wallet', label: 'Digital Wallet' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]


type Tab = 'voice' | 'manual'

export default function RecordScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories, createCategory } = useCategories(user?.id)
  const { createTransaction } = useTransactions(user?.id)
  const router = useRouter()

  const userLocale = profile?.locale ?? 'en'
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
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.shortcut_amount])

  // Manual entry state
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [direction, setDirection] = useState<TransactionDirection>('debit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [manualSaving, setManualSaving] = useState(false)

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
    const { error } = await createTransaction({
      amount: expense.amount,
      direction: expense.direction,
      currency_code: expense.currency,
      merchant: expense.merchant,
      note: expense.note,
      category_id: expense.categoryId,
      payment_method: voice.parsedExpense?.payment_method ?? 'cash',
      source: transactionSource,
      raw_transcript: voice.transcript || null,
      ai_confidence: voice.parsedExpense?.confidence ?? null,
    })
    setConfirmSaving(false)

    if (error) {
      Alert.alert('Error', error)
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
      Alert.alert('Permission required', 'Camera access is needed to scan receipts.')
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
      Alert.alert('Scan failed', err instanceof Error ? err.message : 'Could not read the image.')
    } finally {
      setScanLoading(false)
    }
  }

  async function handleManualSave() {
    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid amount greater than 0')
      return
    }
    if (!user) return

    setManualSaving(true)
    const { error } = await createTransaction({
      amount: parsedAmount,
      direction,
      currency_code: userCurrency,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      category_id: categoryId,
      payment_method: paymentMethod,
    })
    setManualSaving(false)

    if (error) {
      Alert.alert('Error', error)
    } else {
      setAmount('')
      setMerchant('')
      setNote('')
      setCategoryId(null)
      setDirection('debit')
      setPaymentMethod('cash')
      router.push('/(tabs)')
    }
  }

  const isListening = voice.state === 'listening'
  const isProcessing = voice.state === 'processing'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
          <Text style={styles.voiceTitle}>{t('voice.title', userLocale as any)}</Text>
          <Text style={styles.voiceSubtitle}>{t('voice.subtitle', userLocale as any)}</Text>

          {/* Live transcript */}
          {(isListening || isProcessing || voice.transcript) && (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptText}>
                {voice.transcript || voice.interimTranscript || '...'}
              </Text>
            </View>
          )}

          {/* Waveform */}
          <View style={styles.waveformContainer}>
            <VoiceWaveform active={isListening} />
          </View>

          {/* Processing indicator */}
          {isProcessing && (
            <View style={styles.processingRow}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.processingText}>{t('voice.parsing', userLocale as any)}</Text>
            </View>
          )}

          {/* Error */}
          {voice.state === 'error' && (
            <Text style={styles.errorText}>{voice.errorMessage ?? 'Something went wrong'}</Text>
          )}

          {/* Mic button */}
          <Pressable
            style={[
              styles.micButton,
              isListening && styles.micButtonActive,
              isProcessing && styles.micButtonDisabled,
            ]}
            onPress={handleMicPress}
            disabled={isProcessing}
          >
            <Text style={styles.micIcon}>{isListening ? '⏹' : '🎤'}</Text>
          </Pressable>

          {isListening && <Text style={styles.tapToStop}>{t('voice.tap_to_stop', userLocale as any)}</Text>}

          {/* Scan buttons */}
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
                  <Text style={styles.scanIcon}>📄</Text>
                  <Text style={styles.scanLabel}>{t('voice.scan_receipt', userLocale as any)}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.scanButton}
              onPress={() => handleScan('paycheck')}
              disabled={scanLoading}
            >
              <Text style={styles.scanIcon}>💵</Text>
              <Text style={styles.scanLabel}>{t('voice.scan_paycheck', userLocale as any)}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* ── MANUAL TAB ── */
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.manualContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
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

            <View style={styles.amountContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('voice.merchant_source', userLocale as any)}</Text>
                <TextInput
                  style={styles.input}
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="e.g. Starbucks"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t('voice.category', userLocale as any)}</Text>
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                  onCreateCategory={createCategory}
                />
              </View>

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
                          {m.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </View>

            <Pressable
              style={[styles.saveButton, manualSaving && styles.saveButtonDisabled]}
              onPress={handleManualSave}
              disabled={manualSaving}
            >
              {manualSaving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>{t('common.save', userLocale as any)}</Text>
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
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  tabRow: {
    flexDirection: 'row',
    margin: Spacing.base,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
  tabActive: { backgroundColor: Colors.primary },
  tabLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  tabLabelActive: { color: Colors.white },

  // Voice tab
  voiceContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    gap: Spacing.base,
  },
  voiceTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
  },
  voiceSubtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  transcriptBox: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'stretch',
  },
  transcriptText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  waveformContainer: { height: 60, justifyContent: 'center' },
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  micButtonActive: { backgroundColor: Colors.destructive },
  micButtonDisabled: { opacity: 0.5 },
  micIcon: { fontSize: 32 },
  tapToStop: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
  },
  scanRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  scanButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
  },
  scanIcon: { fontSize: 24 },
  scanLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },

  // Manual tab
  manualContent: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing['3xl'] },
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
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  currencySymbol: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size['2xl'],
    color: Colors.textSecondary,
  },
  amountInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: Typography.size['3xl'],
    color: Colors.text,
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
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
})
