import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { CenterModal } from './CenterModal'
import { Colors, Typography, Hairline, Motion } from '../theme'
import { t, currencySymbolFor, type Locale } from '@voice-expense/shared'

interface Props {
  visible: boolean
  /** Current monthly income (pre-fills the amount input). null = empty. */
  initialAmount?: number | null
  /** Current source / employer name. null = empty. */
  initialSource?: string | null
  currency: string
  locale: Locale
  /**
   * Persist the edit. Amount and source are both nullable — saving a null
   * amount clears the stored income.
   */
  onSave: (amount: number | null, source: string | null) => Promise<boolean>
  onClose: () => void
}

/**
 * Monthly income editor, shared by Settings and the Today "Getting
 * started" card (income left onboarding in the Sep 19 2026 first-run
 * rebuild).
 *
 * A centered dialog, like the budget editor: two fields and two buttons
 * have no business taking over the screen, and the actions sit side by
 * side where a long translation cannot clip them.
 */
export function IncomeEditorModal({
  visible,
  initialAmount,
  initialSource,
  currency,
  locale,
  onSave,
  onClose,
}: Props) {
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setAmount(initialAmount != null ? String(initialAmount) : '')
      setSource(initialSource ?? '')
    }
  }, [visible, initialAmount, initialSource])

  // Focus once the dialog has finished arriving: focusing on mount opens
  // the keyboard mid-animation, which made the card jump (owner report,
  // Sep 19 2026).
  const amountRef = useRef<TextInput>(null)
  useEffect(() => {
    if (!visible) return
    const id = setTimeout(() => amountRef.current?.focus(), Motion.enterMs + 80)
    return () => clearTimeout(id)
  }, [visible])

  const parsed = parseFloat(amount)
  const valid = Number.isFinite(parsed) && parsed > 0

  async function handleSave() {
    setSaving(true)
    const ok = await onSave(valid ? parsed : null, source.trim() || null)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <CenterModal
      visible={visible}
      onClose={onClose}
      title={t('settings.monthly_income', locale)}
      subtitle={t('settings.income_source_helper', locale)}
      primaryLabel={t('common.save', locale)}
      onPrimary={handleSave}
      primaryDisabled={!valid}
      busy={saving}
      secondaryLabel={t('common.cancel', locale)}
      testID="income-editor"
    >
      <View style={styles.amountCard}>
        <Text style={styles.currency}>{currencySymbolFor(currency)}</Text>
        <TextInput
          ref={amountRef}
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
          placeholder="0"
          placeholderTextColor={Colors.ink4}
          keyboardType="decimal-pad"
          style={styles.amountInput}
          maxLength={12}
          accessibilityLabel={t('settings.income_amount', locale)}
        />
      </View>
      <Text style={styles.hint}>
        {t('onboarding.income.per_month', locale)} · {currency}
      </Text>

      <Text style={styles.label}>{t('onboarding.income.source_label', locale)}</Text>
      <TextInput
        value={source}
        onChangeText={setSource}
        placeholder={t('onboarding.income.source_placeholder', locale)}
        placeholderTextColor={Colors.ink4}
        style={styles.sourceInput}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={handleSave}
      />
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
  currency: { fontFamily: Typography.fontFamily.serif, fontSize: 22, color: Colors.ink3 },
  amountInput: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 38,
    lineHeight: 44,
    color: Colors.ink,
    minWidth: 80,
    paddingVertical: 0,
    textAlign: 'center',
  },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12.5,
    color: Colors.ink4,
    fontFamily: Typography.fontFamily.sansSemiBold,
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
  sourceInput: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    fontSize: 15.5,
    color: Colors.ink,
    fontFamily: Typography.fontFamily.sans,
  },
})
