import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet, Alert } from 'react-native'
import { BottomSheet } from './BottomSheet'
import { CategoryPicker } from './CategoryPicker'
import { Colors, Typography, Hairline, Radius, Spacing } from '../theme'
import { computeNextOccurrence } from '../hooks/useRecurringRules'
import { t, currencySymbolFor, validateAmount, localDay, civilDateTimeToInstant } from '@voice-expense/shared'
import type { Category, Locale, RecurringFrequency, RecurringRule } from '@voice-expense/shared'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS']

const FREQUENCIES: { value: RecurringFrequency; key: string }[] = [
  { value: 'daily', key: 'recurring.daily' },
  { value: 'weekly', key: 'recurring.weekly' },
  { value: 'biweekly', key: 'recurring.biweekly' },
  { value: 'monthly', key: 'recurring.monthly' },
  { value: 'quarterly', key: 'recurring.quarterly' },
  { value: 'yearly', key: 'recurring.yearly' },
]

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` -> a real calendar date (rejects Feb 30, month 13, etc.)
 *  rather than trusting `civilDateTimeToInstant` to silently normalise an
 *  out-of-range day the way `Date`'s own overflow arithmetic does. */
function parseDateInput(raw: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(raw.trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12) return null
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d < 1 || d > daysInMonth) return null
  return { y, m, d }
}

export interface RecurringRuleFormValues {
  name: string | null
  amount: number
  currency_code: string
  category_id: string | null
  direction: 'debit' | 'credit'
  frequency: RecurringFrequency
  interval: number
  /** Noon-anchored instant for the chosen civil date, in `tz`. */
  starts_at: string
  ends_at: string | null
}

interface Props {
  visible: boolean
  mode: 'create' | 'edit'
  /** Pre-fills every field when editing; ignored (defaults apply) when creating. */
  initial?: RecurringRule | null
  categories: Category[]
  onCreateCategory: (name: string) => Promise<Category | null>
  /** Profile default — used for a brand-new rule's currency. */
  defaultCurrency: string
  locale: Locale
  tz: string
  onSave: (values: RecurringRuleFormValues) => Promise<boolean>
  onClose: () => void
}

/**
 * The one create/edit form for a recurring rule (fix-plan 3.3), rendered
 * on the Recurring screen for both "Add manually" and tapping an
 * existing rule to edit it. Renders through the shared `<BottomSheet>`
 * (fix-plan 1.8/2.14) rather than a fifth hand-rolled sheet.
 *
 * Fields match the plan's list exactly: name, amount, currency,
 * category, direction, frequency, interval, next date, and `ends_at`
 * as "Cancel from".
 */
export function RecurringRuleEditor({
  visible,
  mode,
  initial,
  categories,
  onCreateCategory,
  defaultCurrency,
  locale,
  tz,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [interval, setInterval_] = useState('1')
  const [nextDate, setNextDate] = useState('')
  const [hasEndDate, setHasEndDate] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) return
    if (mode === 'edit' && initial) {
      setName(initial.name ?? '')
      setAmount(String(initial.amount))
      setCurrency(initial.currency_code || defaultCurrency)
      setCategoryId(initial.category_id)
      setDirection(initial.direction)
      setFrequency(initial.frequency)
      setInterval_(String(initial.interval || 1))
      // The rule's next *displayed* charge (`useRecurringRules`'s
      // `computeNextOccurrence`), not the raw `starts_at` — after a rule
      // has generated at least once, `starts_at` is history, not what's
      // coming up.
      const next = computeNextOccurrence(initial, undefined, tz)
      setNextDate(next ? localDay(next.toISOString(), tz) : localDay(initial.starts_at, tz))
      setHasEndDate(!!initial.ends_at)
      setEndDate(initial.ends_at ? localDay(initial.ends_at, tz) : '')
    } else {
      setName('')
      setAmount('')
      setCurrency(defaultCurrency)
      setCategoryId(null)
      setDirection('debit')
      setFrequency('monthly')
      setInterval_('1')
      setNextDate(localDay(new Date().toISOString(), tz))
      setHasEndDate(false)
      setEndDate('')
    }
  }, [visible, mode, initial, defaultCurrency, tz])

  const title = mode === 'edit' ? t('recurring.edit_rule_title', locale) : t('recurring.new_rule_title', locale)

  async function handleSave() {
    const amountValidation = validateAmount(amount, currency)
    if (!amountValidation.ok) {
      const message =
        amountValidation.reason === 'too_large'
          ? t('voice.amount_too_large', locale)
          : amountValidation.reason === 'too_many_decimals'
            ? t('voice.amount_too_many_decimals', locale)
            : t('voice.invalid_amount_msg', locale)
      Alert.alert(t('voice.invalid_amount', locale), message)
      return
    }

    const nextParsed = parseDateInput(nextDate)
    if (!nextParsed) {
      Alert.alert(t('common.error', locale), t('recurring.invalid_date', locale))
      return
    }
    let endsAtInstant: string | null = null
    if (hasEndDate) {
      const endParsed = parseDateInput(endDate)
      if (!endParsed) {
        Alert.alert(t('common.error', locale), t('recurring.invalid_date', locale))
        return
      }
      endsAtInstant = civilDateTimeToInstant(endParsed.y, endParsed.m, endParsed.d, 12, 0, 0, tz)
    }

    const intervalParsed = Math.max(1, Math.min(99, Math.round(Number(interval)) || 1))

    setSaving(true)
    const ok = await onSave({
      name: name.trim() || null,
      amount: amountValidation.amount,
      currency_code: currency,
      category_id: categoryId,
      direction,
      frequency,
      interval: intervalParsed,
      starts_at: civilDateTimeToInstant(nextParsed.y, nextParsed.m, nextParsed.d, 12, 0, 0, tz),
      ends_at: endsAtInstant,
    })
    setSaving(false)
    if (ok) {
      onClose()
    } else {
      Alert.alert(t('common.error', locale), t('recurring.save_error', locale))
    }
  }

  const currencySymbol = useMemo(() => currencySymbolFor(currency), [currency])

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      cancelLabel={t('common.cancel', locale)}
      contentContainerStyle={styles.body}
      scrollViewProps={{ keyboardShouldPersistTaps: 'handled' }}
      // Save lives in the pinned footer, not the header: this is the
      // app's tallest sheet, and a header-only action left the scrolling
      // body running straight off the bottom of the screen with nothing
      // to mark its end (build 12 feedback: "stuck at the bottom, can't
      // see it entirely"). A footer gives the sheet a visible floor above
      // the home indicator, and the body scrolls above it.
      footer={
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, saving && styles.saveButtonDisabled, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.saveButtonText}>
            {mode === 'edit' ? t('voice.save_changes', locale) : t('recurring.add_rule_cta', locale)}
          </Text>
        </Pressable>
      }
      testID="recurring-rule-editor-sheet"
    >
      {/* Direction — a two-way segmented control conveyed by colour alone,
          same shape as record.tsx's Voice/Manual tabs (fix-plan 4.1). */}
      <View style={styles.directionRow} accessibilityRole="tablist">
        <Pressable
          style={[styles.directionBtn, direction === 'debit' && styles.directionBtnActive]}
          onPress={() => setDirection('debit')}
          accessibilityRole="tab"
          accessibilityState={{ selected: direction === 'debit' }}
        >
          <Text style={[styles.directionLabel, direction === 'debit' && styles.directionLabelActive]}>
            {t('voice.expense', locale)}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.directionBtn, direction === 'credit' && styles.directionBtnActiveIncome]}
          onPress={() => setDirection('credit')}
          accessibilityRole="tab"
          accessibilityState={{ selected: direction === 'credit' }}
        >
          <Text style={[styles.directionLabel, direction === 'credit' && styles.directionLabelActiveIncome]}>
            {t('voice.income_label', locale)}
          </Text>
        </Pressable>
      </View>

      {/* Amount + currency */}
      <Text style={styles.fieldLabel}>{t('recurring.amount_label', locale)}</Text>
      <View style={styles.amountRow}>
        <Text style={styles.currencyGlyph}>{currencySymbol}</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
          placeholder="0.00"
          placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
          keyboardType="decimal-pad"
          style={styles.amountInput}
        />
      </View>
      <Text style={styles.fieldLabel}>{t('recurring.currency_label', locale)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <View style={styles.chipRow}>
          {CURRENCIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCurrency(c)}
              style={[styles.chip, currency === c && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, currency === c && styles.chipLabelActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Name */}
      <Text style={styles.fieldLabel}>{t('recurring.name_label', locale)}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('recurring.name_placeholder', locale)}
        placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
        style={styles.textInput}
        autoCapitalize="words"
      />

      {/* Category */}
      <Text style={styles.fieldLabel}>{t('voice.category', locale)}</Text>
      <CategoryPicker
        categories={categories}
        selectedId={categoryId}
        onSelect={setCategoryId}
        onCreateCategory={onCreateCategory}
        locale={locale}
      />

      {/* Frequency — same colour-only-selection shape as `RecurringToggle`'s
          chips, so it needs the same `radiogroup`/`radio` treatment
          (fix-plan 4.1, audit 03-F36): this editor didn't exist when that
          finding was written, but it reproduces the exact defect. */}
      <Text style={styles.fieldLabel}>{t('recurring.frequency', locale)}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        accessibilityRole="radiogroup"
      >
        <View style={styles.chipRow}>
          {FREQUENCIES.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => setFrequency(f.value)}
              style={[styles.chip, frequency === f.value && styles.chipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: frequency === f.value }}
              accessibilityLabel={t(f.key, locale)}
            >
              <Text style={[styles.chipLabel, frequency === f.value && styles.chipLabelActive]}>
                {t(f.key, locale)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Interval */}
      <Text style={styles.fieldLabel}>{t('recurring.interval_label', locale)}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepperBtn}
          onPress={() => setInterval_(String(Math.max(1, (Number(interval) || 1) - 1)))}
        >
          <Text style={styles.stepperBtnText}>−</Text>
        </Pressable>
        <TextInput
          value={interval}
          onChangeText={(v) => setInterval_(v.replace(/[^\d]/g, ''))}
          keyboardType="number-pad"
          style={styles.stepperInput}
        />
        <Pressable
          style={styles.stepperBtn}
          onPress={() => setInterval_(String(Math.min(99, (Number(interval) || 1) + 1)))}
        >
          <Text style={styles.stepperBtnText}>+</Text>
        </Pressable>
        <Text style={styles.stepperHint}>{t('recurring.interval_hint', locale)}</Text>
      </View>

      {/* Next charge */}
      <Text style={styles.fieldLabel}>{t('recurring.next_charge_label', locale)}</Text>
      <TextInput
        value={nextDate}
        onChangeText={setNextDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
        style={styles.textInput}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
      />

      {/* End date ("Cancel from") */}
      <Pressable style={styles.endToggleRow} onPress={() => setHasEndDate(!hasEndDate)}>
        <View style={[styles.checkbox, hasEndDate && styles.checkboxActive]}>
          {hasEndDate && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.endToggleLabel}>{t('recurring.end_date_toggle', locale)}</Text>
      </Pressable>
      {hasEndDate ? (
        <>
          <Text style={styles.fieldLabel}>{t('recurring.end_date_label', locale)}</Text>
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
            style={styles.textInput}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />
        </>
      ) : (
        <Text style={styles.noEndHint}>{t('recurring.no_end_date', locale)}</Text>
      )}
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  saveButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.ink ?? '#1B1915',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },

  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, gap: 4 },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sansBold,
    marginTop: 16,
    marginBottom: 6,
  },

  directionRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    marginTop: 8,
  },
  directionBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRadius: Radius.sm },
  directionBtnActive: { backgroundColor: Colors.expense ?? Colors.ink },
  directionBtnActiveIncome: { backgroundColor: Colors.income ?? Colors.primary },
  directionLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  directionLabelActive: { color: '#FFFFFF' },
  directionLabelActiveIncome: { color: '#FFFFFF' },

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
    fontSize: 22,
    color: Colors.ink3 ?? Colors.textSecondary,
    opacity: 0.6,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontFamily: Typography.fontFamily.serif,
    fontSize: 28,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
  },

  textInput: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink ?? Colors.text,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },

  chipScroll: { marginHorizontal: -20 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    backgroundColor: Colors.surface ?? Colors.card,
  },
  chipActive: { backgroundColor: Colors.primaryLight ?? Colors.accentSoft, borderColor: Colors.primary ?? Colors.accent },
  chipLabel: { fontFamily: Typography.fontFamily.sans, fontSize: 13, color: Colors.ink3 ?? Colors.textSecondary },
  chipLabelActive: { color: Colors.primary ?? Colors.accent, fontFamily: Typography.fontFamily.sansSemiBold },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    backgroundColor: Colors.surface ?? Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 18, fontWeight: '600', color: Colors.ink ?? Colors.text },
  stepperInput: {
    width: 48,
    textAlign: 'center',
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 16,
    color: Colors.ink ?? Colors.text,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    borderRadius: Radius.sm,
    paddingVertical: 6,
  },
  stepperHint: {
    flex: 1,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 11,
    color: Colors.ink4 ?? Colors.textMuted,
  },

  endToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: Colors.primary ?? Colors.accent, borderColor: Colors.primary ?? Colors.accent },
  checkboxMark: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  endToggleLabel: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.ink ?? Colors.text,
  },
  noEndHint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 12,
    color: Colors.ink4 ?? Colors.textMuted,
    marginTop: 8,
  },
})
