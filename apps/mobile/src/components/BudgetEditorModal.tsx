import { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native'
import { Colors, Typography, Radius, Hairline } from '../theme'
import { t, currencySymbolFor, merchantColor, type Locale } from '@voice-expense/shared'
import type { BudgetPeriod, Category } from '@voice-expense/shared'

// All five `BudgetPeriod` values (fix-plan 2.5 — "Ship all five periods
// in `BudgetEditorModal`"). Quarterly/yearly were missing here entirely,
// so there was no way to *create* a quarterly or yearly budget on
// mobile even though `packages/shared/src/utils/period.ts` and the web
// picker both already supported them — a quarterly budget could only be
// set on web, then rendered (wrongly — see `useBudget.ts`'s old
// `usePeriodSpend`) on mobile.
const BUDGET_PERIODS: { value: BudgetPeriod; key: string }[] = [
  { value: 'weekly', key: 'settings.period_weekly' },
  { value: 'biweekly', key: 'settings.period_biweekly' },
  { value: 'monthly', key: 'settings.period_monthly' },
  { value: 'quarterly', key: 'settings.period_quarterly' },
  { value: 'yearly', key: 'settings.period_yearly' },
]

interface Props {
  visible: boolean
  /** Current budget amount (pre-fills the input). null = empty. */
  initialAmount?: number | null
  /** Current budget period (pre-selects the period row). Defaults to monthly. */
  initialPeriod?: BudgetPeriod | null
  currency: string
  locale: Locale
  /** Persist the edit. Return true on success. `categoryId` is null for
   *  the overall budget, or the category this budget caps. */
  onSave: (amount: number, period: BudgetPeriod, categoryId: string | null) => Promise<boolean>
  onClose: () => void
  /** When provided, the sheet offers an "Applies to" picker — overall or one
   *  of these categories (per-category budgets, same model as web). Omit
   *  for an overall-only editor (Settings). */
  categories?: Category[]
  /** Pre-selected scope: null = overall. Only meaningful with `categories`. */
  initialCategoryId?: string | null
  /** Lock the scope (editing an existing budget) — the picker is shown but
   *  not changeable, so an edit can't silently become a different budget. */
  lockCategory?: boolean
}

/**
 * Shared budget editor modal — used by the Settings screen and the Budgets
 * tab. Sets or modifies a budget's amount and period; with `categories`
 * it also picks the scope (overall vs one category).
 */
export function BudgetEditorModal({
  visible,
  initialAmount,
  initialPeriod,
  currency,
  locale,
  onSave,
  onClose,
  categories,
  initialCategoryId = null,
  lockCategory = false,
}: Props) {
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setAmount(initialAmount != null ? String(initialAmount) : '')
      setPeriod(initialPeriod ?? 'monthly')
      setCategoryId(initialCategoryId ?? null)
    }
  }, [visible, initialAmount, initialPeriod, initialCategoryId])

  async function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert(t('common.error', locale), t('settings.invalid_budget', locale))
      return
    }
    setSaving(true)
    const ok = await onSave(parsed, period, categoryId)
    setSaving(false)
    if (!ok) {
      Alert.alert(t('common.error', locale), t('settings.budget_save_error', locale))
      return
    }
    onClose()
  }

  const scopePicker = !!categories

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.modalCancel}>{t('common.cancel', locale)}</Text>
          </Pressable>
          <Text style={styles.modalTitle}>{t('settings.budget', locale)}</Text>
          <Pressable onPress={handleSave} disabled={saving} hitSlop={8}>
            <Text style={[styles.modalDone, saving && styles.modalDoneDisabled]}>
              {t('common.save', locale)}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalBody}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <Text style={styles.modalHint}>{t('settings.budget_hint', locale)}</Text>

          <View style={styles.amountRow}>
            <Text style={styles.currencySymbol}>{currencySymbolFor(currency)}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          {scopePicker && (
            <>
              <Text style={styles.sectionLabel}>{t('budgets.applies_to', locale)}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scopeRow}
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  onPress={() => !lockCategory && setCategoryId(null)}
                  disabled={lockCategory}
                  style={[styles.scopeChip, categoryId === null && styles.scopeChipActive, lockCategory && categoryId !== null && styles.scopeChipDim]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: categoryId === null }}
                >
                  <Text style={[styles.scopeChipLabel, categoryId === null && styles.scopeChipLabelActive]}>
                    {t('budgets.scope_overall', locale)}
                  </Text>
                </Pressable>
                {categories!.map((c) => {
                  const color = c.color ?? merchantColor(c.name)
                  const selected = categoryId === c.id
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => !lockCategory && setCategoryId(c.id)}
                      disabled={lockCategory}
                      style={[
                        styles.scopeChip,
                        selected && { backgroundColor: color + '22', borderColor: color },
                        lockCategory && !selected && styles.scopeChipDim,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.scopeDot, { backgroundColor: color }]} />
                      <Text style={[styles.scopeChipLabel, selected && { color, fontFamily: Typography.fontFamily.sansSemiBold }]}>
                        {c.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </>
          )}

          <Text style={styles.sectionLabel}>{t('settings.budget_period', locale)}</Text>
          <View style={styles.periodList}>
            {BUDGET_PERIODS.map((p, i) => (
              <View key={p.value}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable style={styles.periodRow} onPress={() => setPeriod(p.value)}>
                  <Text style={styles.periodLabel}>{t(p.key, locale)}</Text>
                  {period === p.value && <Text style={styles.periodCheck}>✓</Text>}
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: Colors.background },
  scopeRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface ?? Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scopeChipActive: { backgroundColor: Colors.accentSoft ?? Colors.primaryLight, borderColor: Colors.accent ?? Colors.primary },
  scopeChipDim: { opacity: 0.4 },
  scopeDot: { width: 8, height: 8, borderRadius: 4 },
  scopeChipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink2 ?? Colors.text,
  },
  scopeChipLabelActive: { color: Colors.accent ?? Colors.primary, fontFamily: Typography.fontFamily.sansSemiBold },
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
  modalDoneDisabled: { opacity: 0.5 },
  modalBody: { padding: 16, gap: 16 },
  modalHint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 20,
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
  sectionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.ink3 ?? Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
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
  divider: {
    height: Hairline.width,
    backgroundColor: Hairline.color,
  },
})
