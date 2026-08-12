import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Money } from './Money'
import { MerchantAvatar } from './MerchantAvatar'
import { AmountAdjustChips } from './AmountAdjustChips'
import { RecurringToggle } from './RecurringToggle'
import { NumericAccessory, NUMERIC_ACCESSORY_ID } from './NumericAccessory'
import { Colors, Typography, Spacing, Radius } from '../theme'
import {
  merchantColor,
  t,
  currencySymbolFor,
  formatMoney,
  resolveCategorySuggestion,
  localDay,
  normalizeParsedTransactedAt,
} from '@voice-expense/shared'
import type { ParsedExpense, Locale, Category, PaymentMethod, RecurringFrequency } from '@voice-expense/shared'

/** Pulls the numeric readings a clarifying question names — "Was that
 *  $4.50 or $450?" → [4.5, 450] — so the sheet can offer them as tappable
 *  choices instead of an advisory the user resolves by hand-editing the
 *  amount (fix-plan 2.9b). prompt.ts always phrases this as a two-option
 *  question; anything else is left unrendered rather than guessed at. */
export function extractClarificationAmounts(question: string): number[] {
  const matches = question.match(/\d+(?:[.,]\d+)?/g) ?? []
  const amounts = matches
    .map((m) => parseFloat(m.replace(',', '.')))
    .filter((n) => Number.isFinite(n) && n > 0)
  return amounts.length === 2 ? amounts : []
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
  /** Editable in the expanded sheet; initialized from the parse. Null when
   *  neither the AI nor the user named one — the honest answer. */
  paymentMethod: PaymentMethod | null
  /** AI-parsed date this expense happened on (fix-plan 2.8). Null when the
   *  parse carried none → createTransaction defaults to now. */
  transactedAt: string | null
}

interface Props {
  parsed: ParsedExpense
  transcript: string
  parseDurationMs: number | null
  categories: Category[]
  onCreateCategory: (name: string, color?: string, icon?: string) => Promise<Category | null>
  onSave: (expense: ConfirmedExpense) => Promise<void>
  onDismiss: () => void
  /** Present only for voice sessions — hides the Redo control otherwise. */
  onRedo?: () => void
  saving: boolean
  locale: Locale
  timezone: string
}

const PAYMENT_METHODS: { value: PaymentMethod; key: string }[] = [
  { value: 'cash', key: 'payment.cash' },
  { value: 'credit_card', key: 'payment.credit_card' },
  { value: 'debit_card', key: 'payment.debit_card' },
  { value: 'digital_wallet', key: 'payment.digital_wallet' },
  { value: 'bank_transfer', key: 'payment.bank_transfer' },
]

type Mode = 'confirm' | 'edit'

/**
 * 14b/14c — the parsed result rises in place over the current screen, and
 * "Edit" expands the same sheet rather than navigating. Rendered by
 * VoiceSessionProvider as a root-level layer (no RN Modal), shared by every
 * capture path: voice, receipt/paycheck scan, iOS Shortcut, and the Android
 * payment-notification listener.
 */
export function VoiceResultSheet({
  parsed,
  transcript,
  parseDurationMs,
  categories,
  onCreateCategory,
  onSave,
  onDismiss,
  onRedo,
  saving,
  locale,
  timezone,
}: Props) {
  const insets = useSafeAreaInsets()
  const { height: windowHeight } = useWindowDimensions()

  const [mode, setMode] = useState<Mode>('confirm')
  const [amount, setAmount] = useState(parsed.amount > 0 ? String(parsed.amount) : '')
  const [merchant, setMerchant] = useState(parsed.merchant ?? '')
  const [note, setNote] = useState(parsed.note ?? '')
  const [direction, setDirection] = useState<'debit' | 'credit'>(parsed.direction ?? 'debit')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(parsed.payment_method ?? null)
  const [isRecurring, setIsRecurring] = useState(parsed.is_recurring_suggestion ?? false)
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>(
    parsed.recurring_frequency_suggestion ?? 'monthly',
  )
  const aiDetectedRecurring = parsed.is_recurring_suggestion ?? false

  // Canonical category resolver (fix-plan 2.9d) — exact, curated synonyms,
  // then whole-word overlap; null over a low-confidence guess.
  useEffect(() => {
    const resolved = resolveCategorySuggestion(parsed.category_suggestion, categories)
    if (resolved) setCategoryId((cur) => cur ?? resolved.category.id)
  }, [parsed.category_suggestion, categories])

  // ── Entrance + edit-expansion ──────────────────────────────────────────
  const slideIn = useRef(new Animated.Value(60)).current
  const fadeIn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideIn, { toValue: 0, duration: 420, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
      Animated.timing(fadeIn, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start()
  }, [slideIn, fadeIn])

  const editHeight = windowHeight - insets.top - 44

  const editSnapshot = useRef<{
    amount: string
    merchant: string
    note: string
    direction: 'debit' | 'credit'
    categoryId: string | null
    paymentMethod: PaymentMethod | null
    isRecurring: boolean
    recurringFrequency: RecurringFrequency
  } | null>(null)

  function enterEdit() {
    editSnapshot.current = { amount, merchant, note, direction, categoryId, paymentMethod, isRecurring, recurringFrequency }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setMode('edit')
  }
  function exitEdit(restore: boolean) {
    Keyboard.dismiss()
    if (restore && editSnapshot.current) {
      const s = editSnapshot.current
      setAmount(s.amount)
      setMerchant(s.merchant)
      setNote(s.note)
      setDirection(s.direction)
      setCategoryId(s.categoryId)
      setPaymentMethod(s.paymentMethod)
      setIsRecurring(s.isRecurring)
      setRecurringFrequency(s.recurringFrequency)
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setMode('confirm')
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const parsedAmount = parseFloat(amount.replace(',', '.'))
  const canSave = amount.length > 0 && !isNaN(parsedAmount) && parsedAmount > 0

  // A date-only / midnight-UTC parse ("today", a receipt's printed date)
  // is repaired before it touches the display or the save payload — a raw
  // midnight-UTC instant reads as *yesterday evening* in any zone west of
  // UTC (TestFlight build 8). Null means "the parse carried no real date"
  // → createTransaction defaults to now.
  const normalizedTransactedAt = useMemo(
    () => normalizeParsedTransactedAt(parsed.transacted_at, timezone, new Date().toISOString()),
    [parsed.transacted_at, timezone],
  )

  // One save per sheet, ever — a double Save tap must not write two rows
  // (the row is created locally *before* the server answers, so
  // double-submit means duplicates).
  const submittedRef = useRef(false)

  async function handleSave() {
    if (!canSave || saving || submittedRef.current) return
    submittedRef.current = true

    let finalCategoryId = categoryId
    if (!finalCategoryId && parsed.category_suggestion) {
      const created = await onCreateCategory(parsed.category_suggestion)
      finalCategoryId = created?.id ?? null
    }

    await onSave({
      amount: parsedAmount,
      merchant: merchant.trim() || null,
      categoryId: finalCategoryId,
      note: note.trim() || null,
      direction,
      currency: parsed.currency ?? 'USD',
      isRecurring,
      recurringFrequency,
      paymentMethod,
      transactedAt: normalizedTransactedAt,
    })
  }

  // ── Display helpers ────────────────────────────────────────────────────
  const currency = parsed.currency ?? 'USD'
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  )
  const categoryColor = selectedCategory ? (selectedCategory.color ?? merchantColor(selectedCategory.name)) : null

  const whenLabel = useMemo(() => {
    const nowIso = new Date().toISOString()
    const iso = normalizedTransactedAt ?? nowIso
    const sameDay = localDay(iso, timezone) === localDay(nowIso, timezone)
    const d = new Date(iso)
    const day = sameDay
      ? t('transactions.today', locale)
      : d.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: timezone })
    const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: timezone })
    // A repaired date-only parse has no honest time of day — show just the
    // day for it rather than a fabricated noon.
    const dateOnly = normalizedTransactedAt != null && parsed.transacted_at !== normalizedTransactedAt
    return dateOnly ? day : `${day} · ${time}`
  }, [normalizedTransactedAt, parsed.transacted_at, timezone, locale])

  const directionKey = direction === 'credit' ? 'voice.income_label' : 'voice.expense'
  const clarify = parsed.needs_clarification && parsed.clarifying_question ? parsed.clarifying_question : null
  const clarifyChoices = clarify ? extractClarificationAmounts(clarify) : []

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Backdrop — tap dismisses. */}
      <Pressable
        style={[styles.backdrop, mode === 'edit' && styles.backdropEdit]}
        onPress={onDismiss}
        accessibilityLabel={t('common.cancel', locale)}
      />

      <Animated.View
        style={[
          styles.sheet,
          mode === 'edit' && { height: editHeight },
          {
            opacity: fadeIn,
            transform: [{ translateY: slideIn }],
          },
        ]}
      >
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {mode === 'confirm' ? (
          <View style={{ paddingBottom: insets.bottom + 14 }}>
            {/* Heard-it banner */}
            <View style={styles.bannerRow}>
              <View style={styles.bannerCheck}>
                <Ionicons name="checkmark" size={13} color={Colors.white} />
              </View>
              <Text style={styles.bannerLabel}>
                {t('voice.got_it', locale)} · {t(directionKey, locale)}
              </Text>
              <View style={{ flex: 1 }} />
              {parseDurationMs != null && (
                <Text style={styles.bannerTime}>{`${(parseDurationMs / 1000).toFixed(1)}s`}</Text>
              )}
            </View>

            {/* Amount hero */}
            <View style={styles.amountHero}>
              <Money value={isNaN(parsedAmount) ? 0 : parsedAmount} size={56} currencyCode={currency} locale={locale} />
            </View>

            {/* Clarification — a two-choice amount question when the parse
                was ambiguous. */}
            {clarify && (
              <View style={styles.clarifyCard}>
                <Text style={styles.clarifyQuestion}>{clarify}</Text>
                {clarifyChoices.length > 0 && (
                  <View style={styles.clarifyChoiceRow}>
                    {clarifyChoices.map((value) => {
                      const selected = parsedAmount === value
                      return (
                        <Pressable
                          key={value}
                          style={[styles.clarifyChoiceBtn, selected && styles.clarifyChoiceBtnActive]}
                          onPress={() => setAmount(String(value))}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.clarifyChoiceText, selected && styles.clarifyChoiceTextActive]}>
                            {formatMoney(value, currency, locale)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Merchant card */}
            <View style={styles.merchantCard}>
              <MerchantAvatar
                merchant={merchant.trim() || null}
                merchantDomain={parsed.merchant_domain}
                size={44}
                radius={13}
                categoryName={selectedCategory?.name}
                categoryColor={categoryColor}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.merchantName} numberOfLines={1}>
                  {merchant.trim() || selectedCategory?.name || t(directionKey, locale)}
                </Text>
                <View style={styles.merchantMeta}>
                  {/* When there is no merchant the title above IS the
                      category name — repeating it as a chip read as a
                      glitch (build 8: "Food & Dining / Food & Dining"). */}
                  {selectedCategory && merchant.trim().length > 0 && (
                    <View style={[styles.categoryChip, { backgroundColor: (categoryColor ?? Colors.accent) + '22' }]}>
                      <View style={[styles.categoryDot, { backgroundColor: categoryColor ?? Colors.accent }]} />
                      <Text style={[styles.categoryChipText, { color: categoryColor ?? Colors.accent }]} numberOfLines={1}>
                        {selectedCategory.name}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.metaTime} numberOfLines={1}>
                    {selectedCategory && merchant.trim().length > 0 ? '· ' : ''}
                    {whenLabel}
                  </Text>
                </View>
              </View>
              <Pressable onPress={enterEdit} hitSlop={10} accessibilityRole="button">
                <Text style={styles.editLink}>{t('voice.edit', locale)}</Text>
              </Pressable>
            </View>

            {/* Transcript */}
            {transcript.length > 0 && (
              <View style={styles.transcriptCard}>
                <Ionicons name="mic" size={14} color={Colors.accent} style={{ marginTop: 1 }} />
                <Text style={styles.transcriptText}>{`"${transcript}"`}</Text>
              </View>
            )}

            {parsed.confidence < 0.75 && (
              <Text style={styles.lowConfidence}>{t('voice.low_confidence', locale)}</Text>
            )}

            {/* Actions */}
            <View style={styles.actionsRow}>
              {onRedo && (
                <Pressable
                  style={({ pressed }) => [styles.redoBtn, pressed && styles.pressed]}
                  onPress={onRedo}
                  accessibilityRole="button"
                  accessibilityLabel={t('voice.redo', locale)}
                >
                  <Ionicons name="mic" size={17} color={Colors.ink} />
                  <Text style={styles.redoLabel}>{t('voice.redo', locale)}</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled, pressed && styles.pressed]}
                onPress={handleSave}
                disabled={!canSave || saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {t(direction === 'credit' ? 'voice.save_income' : 'voice.save_expense', locale)}
                  </Text>
                )}
              </Pressable>
            </View>

          </View>
        ) : (
          /* ── 14c: expanded edit ── */
          <View style={{ flex: 1 }}>
            <View style={styles.editHeader}>
              <Pressable onPress={() => exitEdit(true)} hitSlop={10} accessibilityRole="button">
                <Text style={styles.editHeaderCancel}>{t('common.cancel', locale)}</Text>
              </Pressable>
              <Text style={styles.editHeaderTitle}>
                {t(direction === 'credit' ? 'voice.edit_income' : 'voice.edit_expense', locale)}
              </Text>
              <Pressable onPress={() => exitEdit(false)} hitSlop={10} accessibilityRole="button">
                <Text style={styles.editHeaderDone}>{t('common.done', locale)}</Text>
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.editContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              // Keyboard avoidance without a second animation driver on
              // the sheet node: build 11 crashed the moment the keyboard
              // appeared because the JS-driven keyboard lift shared a
              // transform with the native-driven entrance animation
              // (mixed-driver exception, fatal in release). iOS grows the
              // scroll insets natively; Android's adjustResize raises the
              // bottom-anchored sheet with the window.
              automaticallyAdjustKeyboardInsets
            >
              {/* Amount — active field */}
              <View style={styles.editAmountCard}>
                <View style={styles.editAmountHead}>
                  <Text style={styles.fieldLabel}>{t('voice.amount', locale)}</Text>
                </View>
                <View style={styles.editAmountRow}>
                  <Text style={styles.editCurrencySymbol}>{currencySymbolFor(currency)}</Text>
                  <TextInput
                    style={styles.editAmountInput}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                  />
                </View>
                <AmountAdjustChips value={amount} onChange={setAmount} currencyCode={currency} locale={locale} />
              </View>

              {/* Expense / Income */}
              <View style={styles.directionRow}>
                {(['debit', 'credit'] as const).map((d) => (
                  <Pressable
                    key={d}
                    style={[
                      styles.directionBtn,
                      direction === d && (d === 'debit' ? styles.directionDebitActive : styles.directionCreditActive),
                    ]}
                    onPress={() => setDirection(d)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.directionLabel, direction === d && styles.directionLabelActive]}>
                      {t(d === 'debit' ? 'voice.expense' : 'voice.income_label', locale)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Merchant */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('voice.merchant_source', locale)}</Text>
                <TextInput
                  style={styles.input}
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder={t('voice.merchant_placeholder', locale)}
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              {/* Category */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('voice.category', locale)}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {[...categories]
                    .sort((a, b) => (a.id === categoryId ? -1 : b.id === categoryId ? 1 : 0))
                    .map((c) => {
                      const color = c.color ?? merchantColor(c.name)
                      const selected = categoryId === c.id
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setCategoryId(selected ? null : c.id)}
                          style={[styles.chip, selected && { backgroundColor: color + '22', borderColor: color }]}
                        >
                          <View style={[styles.categoryDot, { backgroundColor: color }]} />
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
                {!categoryId && parsed.category_suggestion && (
                  <Text style={styles.aiSuggestion}>
                    {t('voice.ai_suggests', locale)} {parsed.category_suggestion}
                  </Text>
                )}
              </View>

              {/* Date & time — read-only. The parse's own date (or now); a
                  date picker is deliberately out of scope for this pass. */}
              <View style={styles.rowCard}>
                <View style={styles.rowItem}>
                  <Text style={styles.rowLabel}>{t('voice.date_time', locale)}</Text>
                  <Text style={styles.rowValue}>{whenLabel}</Text>
                </View>
              </View>

              {/* Payment */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('voice.payment_method', locale)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {PAYMENT_METHODS.map((m) => {
                    const selected = paymentMethod === m.value
                    return (
                      <Pressable
                        key={m.value}
                        style={[styles.chip, selected && styles.chipActive]}
                        onPress={() => setPaymentMethod(selected ? null : m.value)}
                      >
                        <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>
                          {t(m.key, locale)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Note */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('voice.note', locale)}</Text>
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

              {/* Original transcript — reference only. No replay affordance:
                  the audio never exists as a file (on-device STT, transcript-
                  only), so there is nothing to play back. */}
              {transcript.length > 0 && (
                <View style={styles.transcriptCardFlush}>
                  <Ionicons name="mic" size={14} color={Colors.accent} style={{ marginTop: 1 }} />
                  <Text style={styles.transcriptText}>{`"${transcript}"`}</Text>
                </View>
              )}

              <Pressable onPress={onDismiss} style={styles.discardWrap} hitSlop={8} accessibilityRole="button">
                <Text style={styles.discardText}>
                  {t(direction === 'credit' ? 'voice.discard_income' : 'voice.discard_expense', locale)}
                </Text>
              </Pressable>
            </ScrollView>

            {/* Sticky footer */}
            <View style={[styles.editFooter, { paddingBottom: insets.bottom + 14 }]}>
              <Pressable
                style={({ pressed }) => [styles.saveBtn, (!canSave || saving) && styles.saveBtnDisabled, pressed && styles.pressed]}
                onPress={handleSave}
                disabled={!canSave || saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>{t('voice.save_changes', locale)}</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <NumericAccessory onDone={() => Keyboard.dismiss()} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27,25,21,0.18)',
  },
  backdropEdit: {
    backgroundColor: 'rgba(27,25,21,0.3)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#1B1915',
    shadowOffset: { width: 0, height: -14 },
    shadowOpacity: 0.18,
    shadowRadius: 44,
    elevation: 20,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(40,36,28,0.14)',
  },

  // ── Confirm (14b) ──
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  bannerCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.accent,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bannerTime: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink4,
    fontVariant: ['tabular-nums'],
  },
  amountHero: {
    alignItems: 'center',
    paddingTop: 14,
  },
  merchantCard: {
    marginHorizontal: 22,
    marginTop: 14,
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  merchantName: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink,
    letterSpacing: -0.2,
  },
  merchantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexShrink: 1,
  },
  categoryChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metaTime: {
    fontSize: 12,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink3,
    flexShrink: 1,
  },
  editLink: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.accent,
  },
  transcriptCard: {
    marginHorizontal: 22,
    marginTop: 12,
    padding: 13,
    borderRadius: 16,
    backgroundColor: Colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  transcriptCardFlush: {
    marginTop: 2,
    padding: 13,
    borderRadius: 16,
    backgroundColor: Colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  transcriptText: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink2,
  },
  lowConfidence: {
    marginTop: 10,
    paddingHorizontal: 22,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  redoBtn: {
    width: 58,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.white,
    borderWidth: 0.5,
    borderColor: 'rgba(40,36,28,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  redoLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink3,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  saveBtn: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontSize: 16.5,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.white,
    letterSpacing: -0.2,
  },
  pressed: { opacity: 0.85 },

  // ── Clarification ──
  clarifyCard: {
    marginHorizontal: 22,
    marginTop: 12,
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

  // ── Edit (14c) ──
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  editHeaderCancel: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink3,
  },
  editHeaderTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink,
    letterSpacing: -0.2,
  },
  editHeaderDone: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.accent,
  },
  editContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: Spacing.base,
  },
  editAmountCard: {
    backgroundColor: Colors.background,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    gap: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  editAmountHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  editCurrencySymbol: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: Typography.size.xl,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  editAmountInput: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 44,
    fontWeight: '600',
    letterSpacing: -0.5,
    color: Colors.ink,
    paddingVertical: 0,
    minWidth: 80,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  directionRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  directionBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 11,
  },
  directionDebitActive: { backgroundColor: Colors.white },
  directionCreditActive: { backgroundColor: Colors.white },
  directionLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink3,
  },
  directionLabelActive: { color: Colors.ink },
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink,
    borderWidth: 0.5,
    borderColor: 'rgba(40,36,28,0.14)',
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
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  chipLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.text,
  },
  chipLabelActive: {
    color: Colors.primary,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  aiSuggestion: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.xs,
    color: Colors.primary,
    marginTop: 2,
  },
  rowCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: Colors.line,
  },
  rowItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink3,
  },
  rowValue: {
    fontSize: 14.5,
    fontWeight: '500',
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink,
  },
  discardWrap: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  discardText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.destructive,
  },
  editFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    backgroundColor: Colors.white,
  },
})
