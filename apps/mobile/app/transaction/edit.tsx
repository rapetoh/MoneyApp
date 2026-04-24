import { useEffect, useState } from 'react'
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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useCategories } from '../../src/hooks/useCategories'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { getTransactionById } from '../../src/services/sync/transactionStore'
import { CategoryPicker } from '../../src/components/CategoryPicker'
import { RecurringToggle } from '../../src/components/RecurringToggle'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t } from '@voice-expense/shared'
import type { Transaction, TransactionDirection, PaymentMethod, Locale, RecurringFrequency } from '@voice-expense/shared'

const PAYMENT_METHODS: { value: PaymentMethod; key: string }[] = [
  { value: 'cash', key: 'payment.cash' },
  { value: 'credit_card', key: 'payment.credit_card' },
  { value: 'debit_card', key: 'payment.debit_card' },
  { value: 'digital_wallet', key: 'payment.digital_wallet' },
  { value: 'bank_transfer', key: 'payment.bank_transfer' },
]

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories, createCategory } = useCategories(user?.id)
  const { editTransaction } = useTransactions(user?.id)
  const { rules, createRule, deleteRule, updateRule } = useRecurringRules(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [txn, setTxn] = useState<Transaction | null>(null)

  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [note, setNote] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [direction, setDirection] = useState<TransactionDirection>('debit')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  // Recurring state — initial values come from the transaction + any
  // existing rule linked via template_txn_id. If the transaction is flagged
  // recurring but no rule is found, we still show the toggle as ON so the
  // user can see the truth (the txn says recurring) and fix it on save.
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')

  useEffect(() => {
    if (!id) return
    getTransactionById(id).then((data) => {
      if (data) {
        setTxn(data)
        setAmount(String(data.amount))
        setMerchant(data.merchant ?? '')
        setNote(data.note ?? '')
        setCategoryId(data.category_id)
        setDirection(data.direction)
        setPaymentMethod(data.payment_method ?? 'cash')
        setIsRecurring(data.is_recurring ?? false)
        // Prefill frequency from the matching rule if one exists.
        const linkedRule = rules.find((r) => r.template_txn_id === data.id)
        if (linkedRule) setFrequency(linkedRule.frequency)
      }
      setLoading(false)
    })
    // rules intentionally not in deps: we only want the initial value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleSave() {
    const parsedAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert(t('voice.invalid_amount', locale), t('voice.invalid_amount_msg', locale))
      return
    }
    if (!txn) return

    setSaving(true)
    const { error } = await editTransaction(txn.id, {
      amount: parsedAmount,
      direction,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      category_id: categoryId,
      payment_method: paymentMethod,
      is_recurring: isRecurring,
    })

    // Reconcile the recurring_rules row based on how the toggle changed.
    // Four cases, all keyed off whether we already had a rule for this txn:
    //   off → off : no-op
    //   on  → on  : update the rule to match the new values (amount, freq…)
    //   off → on  : create a new rule linked to this txn
    //   on  → off : delete the existing rule
    // Rule match is by template_txn_id. Legacy transactions with
    // is_recurring=true but no rule (the "ghost" case that caused the
    // Recurring screen to look empty) will get a rule created on save.
    const existingRule = rules.find((r) => r.template_txn_id === txn.id)
    const was = !!existingRule
    const now = isRecurring

    if (!error && !was && now) {
      await createRule({
        name: merchant.trim() || null,
        amount: parsedAmount,
        currency_code: txn.currency_code,
        category_id: categoryId,
        direction,
        payment_method: paymentMethod,
        note: note.trim() || null,
        frequency,
        template_txn_id: txn.id,
      })
    } else if (!error && was && !now) {
      await deleteRule(existingRule!.id)
    } else if (!error && was && now) {
      await updateRule(existingRule!.id, {
        name: merchant.trim() || null,
        amount: parsedAmount,
        category_id: categoryId,
        direction,
        payment_method: paymentMethod,
        note: note.trim() || null,
        frequency,
      })
    }

    setSaving(false)
    if (error) {
      Alert.alert(t('common.error', locale), error)
    } else {
      router.back()
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Direction toggle */}
          <View style={styles.directionRow}>
            <Pressable
              style={[styles.directionBtn, direction === 'debit' && styles.directionBtnActive]}
              onPress={() => setDirection('debit')}
            >
              <Text style={[styles.directionLabel, direction === 'debit' && styles.directionLabelActive]}>
                {t('voice.expense', locale)}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.directionBtn, direction === 'credit' && styles.directionBtnActiveIncome]}
              onPress={() => setDirection('credit')}
            >
              <Text style={[styles.directionLabel, direction === 'credit' && styles.directionLabelActiveIncome]}>
                {t('voice.income_label', locale)}
              </Text>
            </Pressable>
          </View>

          {/* Amount */}
          <View style={styles.amountContainer}>
            <Text style={styles.currencySymbol}>{currency}</Text>
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
              <Text style={styles.label}>{t('voice.merchant_source', locale)}</Text>
              <TextInput
                style={styles.input}
                value={merchant}
                onChangeText={setMerchant}
                placeholder={t('voice.merchant_placeholder', locale)}
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('voice.category', locale)}</Text>
              <CategoryPicker
                categories={categories}
                selectedId={categoryId}
                onSelect={setCategoryId}
                onCreateCategory={createCategory}
                locale={locale}
              />
            </View>

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

            <View style={styles.field}>
              <Text style={styles.label}>{t('voice.payment_method', locale)}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {PAYMENT_METHODS.map((m) => (
                    <Pressable
                      key={m.value}
                      style={[styles.chip, paymentMethod === m.value && styles.chipActive]}
                      onPress={() => setPaymentMethod(m.value)}
                    >
                      <Text style={[styles.chipLabel, paymentMethod === m.value && styles.chipLabelActive]}>
                        {t(m.key, locale)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Recurring — every saved field should be editable (was missing
                here which meant users couldn't toggle recurring on an
                existing transaction and couldn't tell if it was flagged). */}
            <RecurringToggle
              isRecurring={isRecurring}
              frequency={frequency}
              onToggle={setIsRecurring}
              onFrequencyChange={setFrequency}
              locale={locale}
            />
          </View>

          <Pressable
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.saveButtonText}>{t('voice.save_changes', locale)}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing['3xl'] },
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
  directionLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.textSecondary },
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
  currencySymbol: { fontFamily: Typography.fontFamily.serif, fontSize: Typography.size['2xl'], fontWeight: '600', color: Colors.textSecondary },
  amountInput: { flex: 1, fontFamily: Typography.fontFamily.serif, fontSize: Typography.size['4xl'], fontWeight: '600', letterSpacing: -0.6, color: Colors.text },
  fields: { gap: Spacing.base },
  field: { gap: Spacing.xs },
  label: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.sm, color: Colors.text },
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
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.sm, color: Colors.textSecondary },
  chipLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  saveButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.sm },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.base, color: Colors.white },
})
