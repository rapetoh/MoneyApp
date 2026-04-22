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
import { t, type Locale } from '@voice-expense/shared'
import type { BudgetPeriod } from '@voice-expense/shared'

const BUDGET_PERIODS: { value: BudgetPeriod; key: string }[] = [
  { value: 'weekly', key: 'settings.period_weekly' },
  { value: 'biweekly', key: 'settings.period_biweekly' },
  { value: 'monthly', key: 'settings.period_monthly' },
]

interface Props {
  visible: boolean
  /** Current budget amount (pre-fills the input). null = empty. */
  initialAmount?: number | null
  /** Current budget period (pre-selects the period row). Defaults to monthly. */
  initialPeriod?: BudgetPeriod | null
  currency: string
  locale: Locale
  /** Persist the edit. Return true on success. */
  onSave: (amount: number, period: BudgetPeriod) => Promise<boolean>
  onClose: () => void
}

/**
 * Shared budget editor modal — used by the Settings screen and the Budgets
 * tab. Lets the user set or modify a global (category-id-null) budget amount
 * and period in a single sheet.
 */
export function BudgetEditorModal({
  visible,
  initialAmount,
  initialPeriod,
  currency,
  locale,
  onSave,
  onClose,
}: Props) {
  const [amount, setAmount] = useState('')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setAmount(initialAmount != null ? String(initialAmount) : '')
      setPeriod(initialPeriod ?? 'monthly')
    }
  }, [visible, initialAmount, initialPeriod])

  async function handleSave() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert(t('common.error', locale), t('settings.invalid_budget', locale))
      return
    }
    setSaving(true)
    const ok = await onSave(parsed, period)
    setSaving(false)
    if (!ok) {
      Alert.alert(t('common.error', locale), t('settings.budget_save_error', locale))
      return
    }
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
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

        <ScrollView contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalHint}>{t('settings.budget_hint', locale)}</Text>

          <View style={styles.amountRow}>
            <Text style={styles.currencySymbol}>{currency}</Text>
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
