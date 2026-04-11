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
import { CategoryPicker } from './CategoryPicker'
import { Colors, Typography, Spacing, Radius } from '../theme'
import type { ParsedExpense } from '@voice-expense/shared'
import type { Category } from '@voice-expense/shared'

interface Props {
  visible: boolean
  transcript: string
  parsedExpense: ParsedExpense | null
  categories: Category[]
  onCreateCategory: (name: string, color?: string, icon?: string) => Promise<unknown>
  onConfirm: (expense: ConfirmedExpense) => Promise<void>
  onDismiss: () => void
  saving: boolean
}

export interface ConfirmedExpense {
  amount: number
  merchant: string | null
  categoryId: string | null
  note: string | null
  direction: 'debit' | 'credit'
  currency: string
}

const DIRECTION_OPTIONS = [
  { value: 'debit' as const, label: 'Expense' },
  { value: 'credit' as const, label: 'Income' },
]

export function VoiceConfirmModal({
  visible,
  transcript,
  parsedExpense,
  categories,
  onCreateCategory,
  onConfirm,
  onDismiss,
  saving,
}: Props) {
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit')

  // Pre-fill from AI parse result
  useEffect(() => {
    if (!parsedExpense) return
    setAmount(parsedExpense.amount > 0 ? String(parsedExpense.amount) : '')
    setMerchant(parsedExpense.merchant ?? '')
    setDirection(parsedExpense.direction ?? 'debit')
    // categoryId will be matched if user has that category — left for user to pick
  }, [parsedExpense])

  // Reset when modal opens fresh
  useEffect(() => {
    if (!visible) {
      setAmount('')
      setMerchant('')
      setCategoryId(null)
      setNote('')
      setDirection('debit')
    }
  }, [visible])

  async function handleConfirm() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) return

    await onConfirm({
      amount: parsed,
      merchant: merchant.trim() || null,
      categoryId,
      note: note.trim() || null,
      direction,
      currency: parsedExpense?.currency ?? 'USD',
    })
  }

  const canSave = amount.length > 0 && !isNaN(parseFloat(amount.replace(',', '.')))

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onDismiss} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>Confirm Expense</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Clarifying question — shown prominently if AI flagged ambiguity */}
            {parsedExpense?.needs_clarification && parsedExpense.clarifying_question && (
              <View style={styles.clarifyCard}>
                <Text style={styles.clarifyIcon}>🤔</Text>
                <Text style={styles.clarifyQuestion}>{parsedExpense.clarifying_question}</Text>
              </View>
            )}

            {/* Transcript */}
            {transcript.length > 0 && (
              <View style={styles.transcriptCard}>
                <Text style={styles.transcriptLabel}>You said</Text>
                <Text style={styles.transcriptText}>"{transcript}"</Text>
              </View>
            )}

            {/* Direction toggle */}
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
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Amount */}
            <View style={styles.amountContainer}>
              <Text style={styles.currencySymbol}>$</Text>
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

            {/* Fields */}
            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.label}>Merchant</Text>
                <TextInput
                  style={styles.input}
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="e.g. Starbucks"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Category</Text>
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                  onCreateCategory={onCreateCategory}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note..."
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            {/* AI confidence indicator */}
            {parsedExpense && parsedExpense.confidence < 0.75 && (
              <Text style={styles.lowConfidence}>
                Low confidence — please verify the details above
              </Text>
            )}

            {/* Save button */}
            <Pressable
              style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
              onPress={handleConfirm}
              disabled={!canSave || saving}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Expense</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  cancelBtn: { width: 60 },
  cancelText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.primary,
  },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing['3xl'] },
  clarifyCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: Radius.md,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: '#F0D080',
  },
  clarifyIcon: { fontSize: 18 },
  clarifyQuestion: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: '#7A5C00',
  },
  transcriptCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  transcriptLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transcriptText: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  directionRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  directionBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  directionDebitActive: { backgroundColor: Colors.expense },
  directionCreditActive: { backgroundColor: Colors.income },
  directionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  directionLabelActive: { color: Colors.white },
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
  lowConfidence: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.base,
    color: Colors.white,
  },
})
