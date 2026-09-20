import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CenterModal } from './CenterModal'
import { Colors, Typography, Hairline, Motion } from '../theme'
import { t, currencySymbolFor, merchantColor, type Locale } from '@voice-expense/shared'
import type { BudgetPeriod, Category } from '@voice-expense/shared'

// All five `BudgetPeriod` values (fix-plan 2.5 — "Ship all five periods
// in `BudgetEditorModal`"). Quarterly/yearly were missing here entirely,
// so there was no way to *create* a quarterly or yearly budget on
// mobile even though `packages/shared/src/utils/period.ts` and the web
// picker both already supported them.
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
  /** Current budget period (pre-selects the period chip). Defaults to monthly. */
  initialPeriod?: BudgetPeriod | null
  currency: string
  locale: Locale
  /** Persist the edit. Return true on success. `categoryId` is null for
   *  the overall budget, or the category this budget caps. */
  onSave: (amount: number, period: BudgetPeriod, categoryId: string | null) => Promise<boolean>
  onClose: () => void
  /** When provided, the dialog offers an "Applies to" picker — overall or
   *  one of these categories (per-category budgets, same model as web).
   *  Omit for an overall-only editor (Settings). */
  categories?: Category[]
  /** Pre-selected scope: null = overall. Only meaningful with `categories`. */
  initialCategoryId?: string | null
  /** Lock the scope (editing an existing budget) — the picker is shown but
   *  not changeable, so an edit can't silently become a different budget. */
  lockCategory?: boolean
}

/**
 * Budget editor, shared by the Budgets tab, Settings and the Today
 * "Getting started" card.
 *
 * A centered dialog rather than a full sheet (owner review, Sep 19 2026):
 * setting a cap is a short, decisive form, and covering the whole Budgets
 * screen to ask for one number hides the very thing the number is about.
 * The period moved from a five-row list to a chip row for the same reason:
 * the dialog stays one glance tall.
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

  // Focus once the dialog has finished arriving: focusing on mount opens
  // the keyboard mid-animation, which made the card jump (owner report,
  // Sep 19 2026).
  const amountRef = useRef<TextInput>(null)
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => amountRef.current?.focus(), Motion.enterMs + 80)
    return () => clearTimeout(id)
  }, [visible])

  const parsed = parseFloat(amount.replace(',', '.'))
  const valid = Number.isFinite(parsed) && parsed > 0

  async function handleSave() {
    if (!valid) {
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

  return (
    <CenterModal
      visible={visible}
      onClose={onClose}
      title={t('settings.budget', locale)}
      subtitle={t('settings.budget_hint', locale)}
      primaryLabel={t('common.save', locale)}
      onPrimary={handleSave}
      primaryDisabled={!valid}
      busy={saving}
      secondaryLabel={t('common.cancel', locale)}
      testID="budget-editor"
    >
      <View style={styles.amountCard}>
        <Text style={styles.currency}>{currencySymbolFor(currency)}</Text>
        <TextInput
          ref={amountRef}
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={Colors.ink4}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={handleSave}
          maxLength={12}
          accessibilityLabel={t('settings.budget', locale)}
        />
      </View>

      {categories && (
        <>
          <Text style={styles.label}>{t('budgets.applies_to', locale)}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={() => !lockCategory && setCategoryId(null)}
              disabled={lockCategory}
              style={[
                styles.chip,
                categoryId === null && styles.chipOn,
                lockCategory && categoryId !== null && styles.chipDim,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: categoryId === null }}
            >
              <Text style={[styles.chipLabel, categoryId === null && styles.chipLabelOn]}>
                {t('budgets.scope_overall', locale)}
              </Text>
            </Pressable>
            {categories.map((c) => {
              const color = c.color ?? merchantColor(c.name)
              const selected = categoryId === c.id
              return (
                <Pressable
                  key={c.id}
                  onPress={() => !lockCategory && setCategoryId(c.id)}
                  disabled={lockCategory}
                  style={[
                    styles.chip,
                    selected && { backgroundColor: color + '22', borderColor: color },
                    lockCategory && !selected && styles.chipDim,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.dot, { backgroundColor: color }]} />
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
        </>
      )}

      <Text style={styles.label}>{t('settings.budget_period', locale)}</Text>
      <View style={styles.periodWrap}>
        {BUDGET_PERIODS.map((p) => {
          const selected = period === p.value
          return (
            <Pressable
              key={p.value}
              onPress={() => setPeriod(p.value)}
              style={[styles.chip, selected && styles.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{t(p.key, locale)}</Text>
            </Pressable>
          )
        })}
      </View>
    </CenterModal>
  )
}

const styles = StyleSheet.create({
  amountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: Colors.surface2,
  },
  currency: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 22,
    color: Colors.ink3,
  },
  amountInput: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 38,
    lineHeight: 44,
    color: Colors.ink,
    minWidth: 80,
    paddingVertical: 0,
    textAlign: 'center',
  },
  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink4,
    fontFamily: Typography.fontFamily.sansBold,
  },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  periodWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipDim: { opacity: 0.4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: { fontFamily: Typography.fontFamily.sans, fontSize: 13.5, color: Colors.ink2 },
  chipLabelOn: { color: Colors.accent, fontFamily: Typography.fontFamily.sansSemiBold },
})
