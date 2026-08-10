import { useEffect, useState } from 'react'
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native'
import { BottomSheet } from './BottomSheet'
import { Colors, Typography, Hairline } from '../theme'
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
   * amount clears the stored income (useful if the user wants to remove it).
   */
  onSave: (amount: number | null, source: string | null) => Promise<boolean>
  onClose: () => void
}

/**
 * Shared monthly-income editor — used by Settings to let the user view and
 * modify the income they set during onboarding. The income is stored on
 * `profile.monthly_income` + `profile.monthly_income_source`; clearing the
 * amount writes null so the field reads "—" everywhere that displays it.
 *
 * Rendered through the shared `<BottomSheet>` (fix-plan 1.8/2.14) rather
 * than a hand-rolled `<Modal>` + `<KeyboardAvoidingView>` — this was one of
 * the four sheets 2.14 names explicitly: it already had `onRequestClose`
 * (audit 01-F14 lists it as one of the three that got this right), so the
 * point of the move isn't fixing this component in isolation, it's that a
 * fourth hand-rolled sheet implementation is itself the defect (01-F1).
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

  async function handleSave() {
    setSaving(true)
    const parsed = parseFloat(amount)
    const nextAmount = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    const nextSource = source.trim() || null
    const ok = await onSave(nextAmount, nextSource)
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('settings.monthly_income', locale)}
      cancelLabel={t('common.cancel', locale)}
      headerRight={
        <Pressable onPress={handleSave} hitSlop={10} disabled={saving}>
          <Text style={[styles.navText, styles.saveText, saving && { opacity: 0.4 }]}>
            {t('common.save', locale)}
          </Text>
        </Pressable>
      }
      contentContainerStyle={styles.body}
      testID="income-editor-sheet"
    >
      <Text style={styles.fieldLabel}>
        {t('settings.income_amount', locale)}
      </Text>
      <View style={styles.amountRow}>
        <Text style={styles.currencyGlyph}>{currencySymbolFor(currency)}</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
          placeholder="0"
          placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
          keyboardType="decimal-pad"
          style={styles.amountInput}
          maxLength={9}
          autoFocus
        />
      </View>
      <Text style={styles.currencyHint}>
        {t('onboarding.income.per_month', locale)} · {currency}
      </Text>

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>
        {t('onboarding.income.source_label', locale)}
      </Text>
      <TextInput
        value={source}
        onChangeText={setSource}
        placeholder={t('onboarding.income.source_placeholder', locale)}
        placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
        style={styles.sourceInput}
        autoCapitalize="words"
      />
      <Text style={styles.helperText}>
        {t('settings.income_source_helper', locale)}
      </Text>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  navText: {
    fontSize: 15,
    color: Colors.ink2 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
  },
  saveText: {
    color: Colors.accent ?? Colors.primary,
    fontWeight: '700',
  },

  body: { paddingHorizontal: 20, paddingTop: 4 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sansBold,
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  currencyGlyph: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 24,
    color: Colors.ink3 ?? Colors.textSecondary,
    opacity: 0.55,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    paddingVertical: 0,
  },
  currencyHint: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 6,
    fontFamily: Typography.fontFamily.sans,
  },
  sourceInput: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  helperText: {
    fontSize: 12.5,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
    fontFamily: Typography.fontFamily.sans,
  },
})
