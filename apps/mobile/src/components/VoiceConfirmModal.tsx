import { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { RecurringToggle } from './RecurringToggle'
import { AmountAdjustChips } from './AmountAdjustChips'
import { Colors, Typography, Spacing, Radius } from '../theme'
import { merchantColor, t } from '@voice-expense/shared'
import type { ParsedExpense, Locale, Category } from '@voice-expense/shared'
import type { RecurringFrequency } from '@voice-expense/shared'

interface Props {
  visible: boolean
  transcript: string
  parsedExpense: ParsedExpense | null
  categories: Category[]
  onCreateCategory: (name: string, color?: string, icon?: string) => Promise<Category | null>
  onConfirm: (expense: ConfirmedExpense) => Promise<void>
  onDismiss: () => void
  saving: boolean
  locale?: Locale
}

export interface ConfirmedExpense {
  amount: number
  merchant: string | null
  categoryId: string | null
  note: string | null
  direction: 'debit' | 'credit'
  currency: string
  isRecurring: boolean
  recurringFrequency: RecurringFrequency
}

const DIRECTION_OPTIONS: { value: 'debit' | 'credit'; key: string }[] = [
  { value: 'debit', key: 'voice.expense' },
  { value: 'credit', key: 'voice.income_label' },
]

export function VoiceConfirmModal({
  visible,
  parsedExpense,
  categories,
  onCreateCategory,
  onConfirm,
  onDismiss,
  saving,
  locale = 'en',
}: Props) {
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit')
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('monthly')
  const [aiDetectedRecurring, setAiDetectedRecurring] = useState(false)

  useEffect(() => {
    if (!parsedExpense) return
    setAmount(parsedExpense.amount > 0 ? String(parsedExpense.amount) : '')
    setMerchant(parsedExpense.merchant ?? '')
    setDirection(parsedExpense.direction ?? 'debit')

    if (parsedExpense.is_recurring_suggestion) {
      setIsRecurring(true)
      setAiDetectedRecurring(true)
      if (parsedExpense.recurring_frequency_suggestion) {
        setRecurringFrequency(parsedExpense.recurring_frequency_suggestion)
      }
    }

    if (parsedExpense.category_suggestion) {
      const suggestion = parsedExpense.category_suggestion.trim().toLowerCase()
      let match = categories.find((c) => c.name.toLowerCase() === suggestion)
      if (!match) match = categories.find((c) => c.name.toLowerCase().includes(suggestion))
      if (!match) match = categories.find((c) => suggestion.includes(c.name.toLowerCase()))
      if (!match) {
        const suggestionWords = suggestion.split(/[\s&,]+/).filter((w) => w.length > 2)
        match = categories.find((c) => {
          const catWords = c.name.toLowerCase().split(/[\s&,]+/).filter((w) => w.length > 2)
          return suggestionWords.some((sw) => catWords.some((cw) => sw === cw || sw.includes(cw) || cw.includes(sw)))
        }) ?? undefined
      }
      if (match) setCategoryId(match.id)
    }
  }, [parsedExpense, categories])

  useEffect(() => {
    if (!visible) {
      setAmount('')
      setMerchant('')
      setCategoryId(null)
      setNote('')
      setDirection('debit')
      setIsRecurring(false)
      setRecurringFrequency('monthly')
      setAiDetectedRecurring(false)
    }
  }, [visible])

  async function handleConfirm() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) return

    let finalCategoryId = categoryId
    if (!finalCategoryId && parsedExpense?.category_suggestion) {
      const created = await onCreateCategory(parsedExpense.category_suggestion)
      finalCategoryId = created?.id ?? null
    }

    await onConfirm({
      amount: parsed,
      merchant: merchant.trim() || null,
      categoryId: finalCategoryId,
      note: note.trim() || null,
      direction,
      currency: parsedExpense?.currency ?? 'USD',
      isRecurring,
      recurringFrequency,
    })
  }

  const canSave = amount.length > 0 && !isNaN(parseFloat(amount.replace(',', '.')))

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.handle} />

              <View style={styles.header}>
                <Text style={styles.title}>{t('voice.parsed_expense', locale)}</Text>
                <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
                  <Ionicons name="close" size={18} color={Colors.text} />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {parsedExpense?.needs_clarification && parsedExpense.clarifying_question && (
                  <View style={styles.clarifyCard}>
                    <Text style={styles.clarifyQuestion}>{parsedExpense.clarifying_question}</Text>
                  </View>
                )}

                {/* Direction + Amount combined */}
                <View style={styles.amountCard}>
                  <View style={styles.directionRow}>
                    {DIRECTION_OPTIONS.map((opt) => (
                      <Pressable
                        key={opt.value}
                        style={[
                          styles.directionBtn,
                          direction === opt.value &&
                            (opt.value === 'debit' ? styles.directionDebitActive : styles.directionCreditActive),
                        ]}
                        onPress={() => setDirection(opt.value)}
                      >
                        <Text
                          style={[
                            styles.directionLabel,
                            direction === opt.value && styles.directionLabelActive,
                          ]}
                        >
                          {t(opt.key, locale)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.amountRow}>
                    <Text style={styles.currencySymbol}>{parsedExpense?.currency ?? 'USD'}</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0.00"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      autoFocus={!parsedExpense?.amount}
                    />
                  </View>
                  <AmountAdjustChips value={amount} onChange={setAmount} />
                </View>

                {/* Merchant */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('voice.merchant_source', locale)}</Text>
                  <TextInput
                    style={styles.input}
                    value={merchant}
                    onChangeText={setMerchant}
                    placeholder={t('voice.merchant_placeholder', locale)}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                {/* Category — inline horizontal chip scroller */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('voice.category', locale)}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipsRow}
                    keyboardShouldPersistTaps="handled"
                  >
                    {[...categories].sort((a, b) => {
                      if (a.id === categoryId) return -1
                      if (b.id === categoryId) return 1
                      return 0
                    }).map((c) => {
                      const color = c.color ?? merchantColor(c.name)
                      const selected = categoryId === c.id
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setCategoryId(selected ? null : c.id)}
                          style={[
                            styles.chip,
                            selected && { backgroundColor: color + '22', borderColor: color },
                          ]}
                        >
                          <View style={[styles.chipDot, { backgroundColor: color }]} />
                          <Text
                            style={[
                              styles.chipLabel,
                              selected && { color, fontFamily: Typography.fontFamily.sansSemiBold },
                            ]}
                          >
                            {c.name}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                  {!categoryId && parsedExpense?.category_suggestion && (
                    <Text style={styles.aiSuggestion}>
                      {t('voice.ai_suggests', locale)} {parsedExpense.category_suggestion}
                    </Text>
                  )}
                </View>

                {/* Note */}
                <View style={styles.field}>
                  <Text style={styles.label}>{t('voice.note', locale)}</Text>
                  <TextInput
                    style={styles.input}
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('voice.note_placeholder', locale)}
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <RecurringToggle
                  isRecurring={isRecurring}
                  frequency={recurringFrequency}
                  aiDetected={aiDetectedRecurring}
                  onToggle={setIsRecurring}
                  onFrequencyChange={setRecurringFrequency}
                  locale={locale}
                />

                {parsedExpense && parsedExpense.confidence < 0.75 && (
                  <Text style={styles.lowConfidence}>{t('voice.low_confidence', locale)}</Text>
                )}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
                  onPress={handleConfirm}
                  disabled={!canSave || saving}
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.saveButtonText}>{t('voice.save', locale)}</Text>
                  )}
                </Pressable>
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '72%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    gap: Spacing.md,
  },
  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  clarifyCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: '#F0D080',
  },
  clarifyQuestion: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: '#7A5C00',
  },
  // "Bordered in accent + soft glow and labeled 'Amount · tap to edit'" per DESIGN.md §5 Confirm.
  // Wrong amount is the #1 voice-parse error; this card's emphasis draws the eye to it.
  amountCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.card,
    padding: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    gap: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  directionRow: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: 3,
  },
  directionBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  directionDebitActive: { backgroundColor: Colors.expense },
  directionCreditActive: { backgroundColor: Colors.income },
  directionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
  },
  directionLabelActive: { color: Colors.white },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingBottom: 4,
  },
  currencySymbol: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size.xl,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  amountInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size['3xl'],
    fontWeight: '600',
    letterSpacing: -0.4,
    color: Colors.text,
    paddingVertical: 0,
  },
  field: { gap: 6 },
  label: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: Spacing.base,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  aiSuggestion: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    marginTop: 2,
  },
  lowConfidence: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
})
