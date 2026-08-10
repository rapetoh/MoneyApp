import { useState, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { BottomSheet } from './BottomSheet'
import { NumericAccessory, NUMERIC_ACCESSORY_ID } from './NumericAccessory'
import { RecurringToggle } from './RecurringToggle'
import { AmountAdjustChips } from './AmountAdjustChips'
import { Colors, Typography, Spacing, Radius } from '../theme'
import { merchantColor, t, currencySymbolFor, formatMoney, resolveCategorySuggestion } from '@voice-expense/shared'
import type { ParsedExpense, Locale, Category } from '@voice-expense/shared'
import type { RecurringFrequency } from '@voice-expense/shared'

/** Pulls the numeric readings a clarifying question names — "Was that
 *  $4.50 or $450?" → [4.5, 450] — so the sheet can offer them as
 *  tappable choices instead of a static advisory the user has to resolve
 *  by hand-editing the amount field below (fix-plan 2.9b: "rendered as a
 *  two-button choice, not an advisory card"). `prompt.ts` always phrases
 *  this as a two-option question naming both readings, so at most two
 *  numbers are ever meaningful here; more than two is left unrendered
 *  (the question text itself still shows) rather than guessed at. */
export function extractClarificationAmounts(question: string): number[] {
  const matches = question.match(/\d+(?:[.,]\d+)?/g) ?? []
  const amounts = matches
    .map((m) => parseFloat(m.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
  return amounts.length === 2 ? amounts : []
}

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
  /** The AI-parsed date this expense actually happened on — "yesterday",
   *  a receipt's printed date, a notification's timestamp (fix-plan 2.8,
   *  audit 02-F8/04-F7/04-F24/07-F7/08-F3). `null` when the parse
   *  carried no date (or there is no parse at all, e.g. manual entry),
   *  in which case the caller's `createTransaction` defaults to now —
   *  it never gets silently overwritten with now when a real date was
   *  parsed, which is what every save path did before this. */
  transactedAt: string | null
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
    setNote(parsedExpense.note ?? '')
    setDirection(parsedExpense.direction ?? 'debit')

    if (parsedExpense.is_recurring_suggestion) {
      setIsRecurring(true)
      setAiDetectedRecurring(true)
      if (parsedExpense.recurring_frequency_suggestion) {
        setRecurringFrequency(parsedExpense.recurring_frequency_suggestion)
      }
    }

    // Canonical resolver (fix-plan 2.9d) — exact, then curated synonyms,
    // then whole-word token overlap with a minimum score. The inline
    // substring cascade this replaces filed "Rent" under "Entertainment"
    // because 'entertainment'.includes('rent'). resolveCategorySuggestion
    // returns null rather than a low-confidence guess, leaving the
    // category unselected for the user to pick.
    const resolved = resolveCategorySuggestion(parsedExpense.category_suggestion, categories)
    if (resolved) setCategoryId(resolved.category.id)
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
      transactedAt: parsedExpense?.transacted_at ?? null,
    })
  }

  const canSave = amount.length > 0 && !isNaN(parseFloat(amount.replace(',', '.')))

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={t('voice.parsed_expense', locale)}
      // The design has no left "Cancel" label — an empty cancelLabel keeps
      // the header's Cancel/title/right three-way layout (and its single
      // onClose wiring, see BottomSheet.tsx / F14) while rendering nothing
      // visible on the left, so the X button on the right is the only
      // apparent dismiss affordance, matching the original design.
      cancelLabel=""
      headerRight={
        <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={8}>
          <Ionicons name="close" size={18} color={Colors.text} />
        </Pressable>
      }
      scrollViewProps={{ showsVerticalScrollIndicator: false }}
      contentContainerStyle={styles.content}
      footer={
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
      }
      testID="voice-confirm-sheet"
    >
      {parsedExpense?.needs_clarification && parsedExpense.clarifying_question && (
        <View style={styles.clarifyCard}>
          <Text style={styles.clarifyQuestion}>{parsedExpense.clarifying_question}</Text>
          {/* An actual choice, not just an advisory to read and then go
              hand-edit the amount field below (fix-plan 2.9b). Only
              renders when the question names exactly two readings, which
              is the only shape prompt.ts ever produces. */}
          {extractClarificationAmounts(parsedExpense.clarifying_question).length > 0 && (
            <View style={styles.clarifyChoiceRow}>
              {extractClarificationAmounts(parsedExpense.clarifying_question).map((value) => {
                const formatted = formatMoney(value, parsedExpense.currency, locale)
                const selected = parseFloat(amount.replace(',', '.')) === value
                return (
                  <Pressable
                    key={value}
                    style={[styles.clarifyChoiceBtn, selected && styles.clarifyChoiceBtnActive]}
                    onPress={() => setAmount(String(value))}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.clarifyChoiceText, selected && styles.clarifyChoiceTextActive]}>
                      {formatted}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}
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
          <Text style={styles.currencySymbol}>{currencySymbolFor(parsedExpense?.currency ?? 'USD')}</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad"
            autoFocus={!parsedExpense?.amount}
            inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
          />
        </View>
        <AmountAdjustChips
          value={amount}
          onChange={setAmount}
          currencyCode={parsedExpense?.currency ?? 'USD'}
          locale={locale}
        />
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

      {/* Shared Done bar for the amount field's decimal-pad — see F8:
          "iOS decimal pad cannot be dismissed" — closed here and at
          transaction/edit.tsx by the one InputAccessoryView. */}
      <NumericAccessory onDone={() => Keyboard.dismiss()} />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
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
  clarifyChoiceRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  clarifyChoiceBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: '#F0D080',
  },
  clarifyChoiceBtnActive: {
    backgroundColor: '#7A5C00',
    borderColor: '#7A5C00',
  },
  clarifyChoiceText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: '#7A5C00',
  },
  clarifyChoiceTextActive: {
    color: Colors.white,
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
    fontWeight: '700',
    fontSize: Typography.size.base,
    color: Colors.white,
  },
})
