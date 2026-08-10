import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
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
import { NumericAccessory, NUMERIC_ACCESSORY_ID } from '../../src/components/NumericAccessory'
import { useKeyboardLift } from '../../src/hooks/useKeyboardLift'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, currencySymbolFor, validateAmount, findRuleForTransaction } from '@voice-expense/shared'
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
  const { rules, updateRule } = useRecurringRules(user?.id)
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
  // null when the transaction has no payment method on record. The chip
  // row leaves every chip inactive in that state so the user can choose
  // — saving without picking preserves null rather than silently
  // promoting the row to 'cash'.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  // Recurring state — initial values come from the transaction + any
  // existing rule linked via template_txn_id. If the transaction is flagged
  // recurring but no rule is found, we still show the toggle as ON so the
  // user can see the truth (the txn says recurring) and fix it on save.
  const [isRecurring, setIsRecurring] = useState(false)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')

  // Correct keyboard-avoidance (audit 01-F37): this screen is mounted
  // below a native header inside a `presentation: 'modal'` card, so RN's
  // own `KeyboardAvoidingView` under-lifts by that header + card offset —
  // it computes its lift from a parent-relative `onLayout` frame compared
  // against a window-space keyboard coordinate, and "parent-relative" here
  // is not "screen-relative". `useKeyboardLift` measures this view's real
  // window position instead, so the lift is correct regardless of the
  // header/presentation offset above it.
  const contentRef = useRef<View>(null)
  const lift = useKeyboardLift(contentRef)

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
        setPaymentMethod(data.payment_method)
        setIsRecurring(data.is_recurring ?? false)
        // The row's own recurring_frequency is the durable, offline-safe
        // record of the user's choice (migration 013); the linked rule
        // (fix-plan 3.3's shared `findRuleForTransaction` — recurring_
        // rule_id first, template_txn_id fallback) is the fallback for
        // legacy rows saved before the column existed.
        const linkedRule = findRuleForTransaction(data, rules)
        setFrequency(data.recurring_frequency ?? linkedRule?.frequency ?? 'monthly')
      }
      setLoading(false)
    })
    // rules intentionally not in deps: we only want the initial value.
  }, [id])

  async function handleSave() {
    // One shared validator (fix-plan 2.14 / audit 01-F1, 01-F34) instead of
    // the bare `isNaN(parseFloat(...)) || <= 0` check — this screen's
    // amount field is free-text (no keypad guarding decimal places the
    // way Manual entry's does), so it's the one edit path that can
    // actually reach `too_large`/`too_many_decimals`.
    const validation = validateAmount(amount, txn?.currency_code ?? currency)
    if (!validation.ok) {
      const message =
        validation.reason === 'too_large'
          ? t('voice.amount_too_large', locale)
          : validation.reason === 'too_many_decimals'
            ? t('voice.amount_too_many_decimals', locale)
            : t('voice.invalid_amount_msg', locale)
      Alert.alert(t('voice.invalid_amount', locale), message)
      return
    }
    const parsedAmount = validation.amount
    if (!txn) return

    // Look up the linked rule via the one shared resolver (fix-plan
    // 3.3's `findRuleForTransaction`, deleting the two-direction lookup
    // this file's own comment used to call "the LOGIC §3.3 bug" —
    // `recurring_rule_id` first (server-cron/catch-up-generated
    // occurrences carry it directly), `template_txn_id` as the fallback
    // for the original "this is recurring" entry.
    const linkedRule = findRuleForTransaction(txn, rules)

    // For a generated occurrence with a linked rule, the user's
    // intent when editing is ambiguous: "fix only this occurrence"
    // (a typo, a one-time adjustment) versus "this is the new amount
    // going forward" (a raise, a price change). Calendar apps prompt
    // for scope on this exact case. We do the same.
    const isGenerated =
      txn.source === 'recurring_generated' && linkedRule != null && isRecurring

    let applyToRule = false
    if (isGenerated) {
      applyToRule = await new Promise<boolean>((resolve) => {
        Alert.alert(
          t('recurring.edit_scope_title', locale),
          t('recurring.edit_scope_body', locale),
          [
            { text: t('common.cancel', locale), style: 'cancel', onPress: () => resolve(false) },
            { text: t('recurring.edit_scope_one', locale), onPress: () => resolve(false) },
            { text: t('recurring.edit_scope_all_future', locale), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        )
      })
    }

    setSaving(true)
    const { error } = await editTransaction(txn.id, {
      amount: parsedAmount,
      direction,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      category_id: categoryId,
      payment_method: paymentMethod,
      is_recurring: isRecurring,
      recurring_frequency: isRecurring ? frequency : null,
    })

    // Rule lifecycle (create on flag, deactivate on unflag of the template)
    // is owned by the server-side transactions trigger — migration 013 —
    // which fires atomically when this edit syncs. The one rule mutation
    // that stays client-side is the explicit "apply to all future" choice
    // on a generated occurrence: that is direct rule management, not
    // creation, and has no sync race.
    const wasLinked = !!linkedRule
    const isTemplate = linkedRule?.template_txn_id === txn.id

    if (!error && wasLinked && isRecurring && (isTemplate || applyToRule)) {
      await updateRule(linkedRule!.id, {
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
      {/* `marginBottom: lift` shrinks this column by the keyboard's real
          overlap (see `useKeyboardLift` above) — same effect as KAV's
          'padding' behavior (the ScrollView gives way, the footer stays
          pinned to the new, higher bottom edge) but driven from a
          measured window position instead of RN's parent-relative one. */}
      <Animated.View ref={contentRef} style={[styles.flex, { marginBottom: lift }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
            <Text style={styles.currencySymbol}>{currencySymbolFor(txn?.currency_code || currency)}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
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
        </ScrollView>

        {/* Pinned outside the ScrollView — see F23: Save was the last child
            of a long scroll and landed below the fold once the keyboard was
            up. `SafeAreaView edges={['bottom']}` above already reserves the
            home-indicator inset, so this footer doesn't add its own. */}
        <View style={styles.footer}>
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
        </View>
      </Animated.View>
      <NumericAccessory onDone={() => Keyboard.dismiss()} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing.lg },
  // Pinned outside the ScrollView (F23) — same shape as
  // VoiceConfirmModal's footer. `SafeAreaView edges={['bottom']}` on the
  // screen root already reserves the home-indicator inset, so this footer
  // does not add insets.bottom itself (that would double-count — see F23's
  // refuted sub-claim).
  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
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
  // fontWeight pairs with fontFamily so this survives a fallback where the
  // named face doesn't resolve — see
  // docs/audit-2026-08-08/01-mobile-ui-and-layout.md F5.
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
  chip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  chipActive: { backgroundColor: Colors.primaryLight, borderColor: Colors.primary },
  chipLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.sm, color: Colors.textSecondary },
  chipLabelActive: { color: Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
  saveButton: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.base, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.base, color: Colors.white },
})
