import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { CenterModal } from './CenterModal'
import { Money } from './Money'
import { useGoals, type SavingsGoal } from '../hooks/useGoals'
import { haptic } from '../services/haptics'
import { Colors, Typography, Motion, Hairline } from '../theme'
import {
  t,
  goalStatus,
  formatMoney,
  currencySymbolFor,
  localDay,
  localParts,
  addMonthsClamped,
  civilDateTimeToInstant,
  type Locale,
  type GoalPace,
} from '@voice-expense/shared'

/**
 * Savings goals on the Budgets tab (migration 042, Oct 2026). Budgets say
 * what may go out; goals say what is being put aside, so the two share a
 * screen. Each card: progress, pace against the date, and what to set aside
 * each month to finish on time. Tapping a card adds or takes out money.
 */
export function GoalsSection({
  userId,
  currency,
  locale,
  tz,
}: {
  userId: string | undefined
  currency: string
  locale: Locale
  tz: string
}) {
  const { goals, contributions, createGoal, updateGoal, archiveGoal, addContribution } = useGoals(userId)
  const [editing, setEditing] = useState<SavingsGoal | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [moneyFor, setMoneyFor] = useState<SavingsGoal | null>(null)

  const rows = useMemo(
    () =>
      goals.map((g) => ({
        goal: g,
        status: goalStatus(g, contributions.filter((c) => c.goal_id === g.id), tz),
      })),
    [goals, contributions, tz],
  )

  function openGoal(goal: SavingsGoal) {
    Alert.alert(goal.name, undefined, [
      { text: t('goals.add_money', locale), onPress: () => setMoneyFor(goal) },
      { text: t('goals.edit', locale), onPress: () => { setEditing(goal); setEditorOpen(true) } },
      {
        text: t('goals.remove', locale),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('goals.remove_confirm', locale), goal.name, [
            { text: t('common.cancel', locale), style: 'cancel' },
            { text: t('goals.remove', locale), style: 'destructive', onPress: () => void archiveGoal(goal.id) },
          ]),
      },
      { text: t('common.cancel', locale), style: 'cancel' },
    ])
  }

  return (
    <View>
      <View style={styles.headRow}>
        <Text style={styles.sectionHead}>{t('goals.title', locale)}</Text>
        {rows.length > 0 && (
          <Pressable
            onPress={() => { setEditing(null); setEditorOpen(true) }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('goals.new', locale)}
          >
            <Text style={styles.headLink}>{t('goals.new', locale)}</Text>
          </Pressable>
        )}
      </View>

      {rows.length === 0 ? (
        <Pressable
          style={({ pressed }) => [styles.emptyCard, pressed && { opacity: 0.7 }]}
          onPress={() => { setEditing(null); setEditorOpen(true) }}
          accessibilityRole="button"
        >
          <View style={styles.emptyIcon}>
            <Ionicons name="flag-outline" size={18} color={Colors.accent} />
          </View>
          <Text style={styles.emptyBody}>{t('goals.empty', locale)}</Text>
          <Text style={styles.emptyLink}>{t('goals.new', locale)}</Text>
        </Pressable>
      ) : (
        <View style={styles.card}>
          {rows.map(({ goal, status }, i) => (
            <Pressable
              key={goal.id}
              onPress={() => openGoal(goal)}
              style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.rowPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${goal.name}, ${formatMoney(status.saved, goal.currency_code, locale)} / ${formatMoney(goal.target_amount, goal.currency_code, locale)}`}
            >
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>{goal.name}</Text>
                <PacePill pace={status.pace} locale={locale} />
              </View>
              <View style={styles.amounts}>
                <Money value={status.saved} size={17} serif={false} sansWeight="700" currencyCode={goal.currency_code} locale={locale} />
                <Text style={styles.of}>
                  {` / ${formatMoney(goal.target_amount, goal.currency_code, locale, { precision: 'whole' })}`}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${status.pct * 100}%` }, status.pace === 'done' && styles.fillDone]} />
              </View>
              <Text style={styles.caption}>{captionFor(status, goal, locale)}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <GoalEditorModal
        visible={editorOpen}
        goal={editing}
        currency={currency}
        locale={locale}
        tz={tz}
        onClose={() => { setEditorOpen(false); setEditing(null) }}
        onSave={(fields) =>
          editing ? updateGoal(editing.id, fields) : createGoal({ ...fields, currency_code: currency })
        }
      />
      <GoalMoneyModal
        goal={moneyFor}
        locale={locale}
        onClose={() => setMoneyFor(null)}
        onSave={(amount) => (moneyFor ? addContribution(moneyFor.id, amount) : Promise.resolve(false))}
      />
    </View>
  )
}

function captionFor(status: ReturnType<typeof goalStatus>, goal: SavingsGoal, locale: Locale): string {
  if (status.pace === 'done') return t('goals.caption_done', locale)
  if (status.pace === 'overdue') return t('goals.caption_overdue', locale)
  if (status.perMonth != null && goal.target_date) {
    return t('goals.caption_per_month', locale)
      .replace('{amount}', formatMoney(status.perMonth, goal.currency_code, locale, { precision: 'whole' }))
      .replace('{date}', formatTargetDate(goal.target_date, locale))
  }
  return t('goals.caption_left', locale).replace(
    '{amount}',
    formatMoney(status.remaining, goal.currency_code, locale, { precision: 'whole' }),
  )
}

function formatTargetDate(day: string, locale: Locale): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const PACE: Record<GoalPace, { key: string; tone: 'good' | 'warn' | 'muted' }> = {
  done: { key: 'goals.pace_done', tone: 'good' },
  ahead: { key: 'goals.pace_ahead', tone: 'good' },
  on_track: { key: 'goals.pace_on_track', tone: 'good' },
  behind: { key: 'goals.pace_behind', tone: 'warn' },
  overdue: { key: 'goals.pace_overdue', tone: 'warn' },
  no_date: { key: '', tone: 'muted' },
}

function PacePill({ pace, locale }: { pace: GoalPace; locale: Locale }) {
  const p = PACE[pace]
  if (!p.key) return null
  return (
    <View style={[styles.pill, p.tone === 'warn' && styles.pillWarn]}>
      <Text style={[styles.pillText, p.tone === 'warn' && styles.pillTextWarn]}>{t(p.key, locale)}</Text>
    </View>
  )
}

// ── New / edit goal ──────────────────────────────────────────────────────

function GoalEditorModal({
  visible,
  goal,
  currency,
  locale,
  tz,
  onClose,
  onSave,
}: {
  visible: boolean
  goal: SavingsGoal | null
  currency: string
  locale: Locale
  tz: string
  onClose: () => void
  onSave: (fields: { name: string; target_amount: number; target_date: string | null }) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [hasDate, setHasDate] = useState(false)
  const [date, setDate] = useState<Date>(() => defaultTargetDate(tz))
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!visible) return
    setName(goal?.name ?? '')
    setAmount(goal ? String(goal.target_amount) : '')
    setHasDate(!!goal?.target_date)
    setDate(goal?.target_date ? dayToDate(goal.target_date, tz) : defaultTargetDate(tz))
    const id = setTimeout(() => nameRef.current?.focus(), Motion.enterMs + 80)
    return () => clearTimeout(id)
  }, [visible, goal, tz])

  const parsed = parseFloat(amount.replace(',', '.'))
  const valid = name.trim().length > 0 && Number.isFinite(parsed) && parsed > 0

  async function save() {
    if (!valid) return
    setSaving(true)
    const ok = await onSave({
      name: name.trim().slice(0, 80),
      target_amount: Math.round(parsed * 100) / 100,
      target_date: hasDate ? localDay(date.toISOString(), tz) : null,
    })
    setSaving(false)
    if (!ok) {
      Alert.alert(t('common.error', locale), t('goals.save_error', locale))
      return
    }
    haptic.success()
    onClose()
  }

  function openAndroidDate() {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (_e, picked) => picked && setDate(picked),
    })
  }

  return (
    <CenterModal
      visible={visible}
      onClose={onClose}
      title={goal ? t('goals.edit', locale) : t('goals.new', locale)}
      primaryLabel={t('common.save', locale)}
      onPrimary={save}
      primaryDisabled={!valid}
      busy={saving}
      secondaryLabel={t('common.cancel', locale)}
      testID="goal-editor"
    >
      <Text style={styles.label}>{t('goals.name', locale)}</Text>
      <TextInput
        ref={nameRef}
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('goals.name_placeholder', locale)}
        placeholderTextColor={Colors.ink4}
        maxLength={80}
        returnKeyType="next"
      />
      <Text style={styles.label}>{t('goals.target', locale)}</Text>
      <View style={styles.amountCard}>
        <Text style={styles.currency}>{currencySymbolFor(currency)}</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={Colors.ink4}
          keyboardType="decimal-pad"
        />
      </View>
      {/* The label and the switch toggle separately: a Switch inside a
          toggling Pressable fires both and flips twice. */}
      <View style={styles.switchRow}>
        <Pressable style={{ flex: 1 }} onPress={() => setHasDate((v) => !v)} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.switchLabel}>{t('goals.by_date', locale)}</Text>
        </Pressable>
        <Switch
          value={hasDate}
          onValueChange={setHasDate}
          trackColor={{ true: Colors.accent, false: Colors.surface2 }}
          accessibilityLabel={t('goals.by_date', locale)}
        />
      </View>
      {hasDate &&
        (Platform.OS === 'ios' ? (
          <View style={styles.dateRow}>
            <DateTimePicker
              value={date}
              mode="date"
              display="compact"
              minimumDate={new Date()}
              accentColor={Colors.accent}
              themeVariant="light"
              onChange={(_e, picked) => picked && setDate(picked)}
            />
          </View>
        ) : (
          <Pressable onPress={openAndroidDate} style={styles.dateRow} accessibilityRole="button">
            <Text style={styles.dateText}>{date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          </Pressable>
        ))}
    </CenterModal>
  )
}

/** Six months from today, at local noon in the profile's zone. */
function defaultTargetDate(tz: string): Date {
  const now = localParts(new Date().toISOString(), tz)
  const t = addMonthsClamped(now.y, now.m, now.d, 6)
  return new Date(civilDateTimeToInstant(t.y, t.m, t.d, 12, 0, 0, tz))
}

/** A stored civil day as a picker value (local noon, so no zone moves it). */
function dayToDate(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(civilDateTimeToInstant(y, m, d, 12, 0, 0, tz))
}

// ── Add / take out money ────────────────────────────────────────────────

function GoalMoneyModal({
  goal,
  locale,
  onClose,
  onSave,
}: {
  goal: SavingsGoal | null
  locale: Locale
  onClose: () => void
  onSave: (amount: number) => Promise<boolean>
}) {
  const [amount, setAmount] = useState('')
  const [takeOut, setTakeOut] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<TextInput>(null)

  useEffect(() => {
    if (!goal) return
    setAmount('')
    setTakeOut(false)
    const id = setTimeout(() => ref.current?.focus(), Motion.enterMs + 80)
    return () => clearTimeout(id)
  }, [goal])

  const parsed = parseFloat(amount.replace(',', '.'))
  const valid = Number.isFinite(parsed) && parsed > 0

  async function save() {
    if (!valid) return
    setSaving(true)
    const value = Math.round(parsed * 100) / 100
    const ok = await onSave(takeOut ? -value : value)
    setSaving(false)
    if (!ok) {
      Alert.alert(t('common.error', locale), t('goals.save_error', locale))
      return
    }
    haptic.success()
    onClose()
  }

  return (
    <CenterModal
      visible={goal != null}
      onClose={onClose}
      title={goal?.name ?? ''}
      primaryLabel={takeOut ? t('goals.take_out', locale) : t('goals.add_money', locale)}
      onPrimary={save}
      primaryDisabled={!valid}
      busy={saving}
      secondaryLabel={t('common.cancel', locale)}
      testID="goal-money"
    >
      <View style={styles.segment}>
        {[false, true].map((out) => (
          <Pressable
            key={String(out)}
            onPress={() => setTakeOut(out)}
            style={[styles.segmentItem, takeOut === out && styles.segmentOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: takeOut === out }}
          >
            <Text style={[styles.segmentText, takeOut === out && styles.segmentTextOn]}>
              {out ? t('goals.take_out', locale) : t('goals.add_money', locale)}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.amountCard, { marginTop: 14 }]}>
        <Text style={styles.currency}>{currencySymbolFor(goal?.currency_code ?? 'USD')}</Text>
        <TextInput
          ref={ref}
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={Colors.ink4}
          keyboardType="decimal-pad"
        />
      </View>
    </CenterModal>
  )
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHead: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    color: Colors.ink3 ?? Colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headLink: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13, color: Colors.accent },
  emptyCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBody: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3 ?? Colors.textSecondary,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyLink: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 13, color: Colors.accent },
  card: { marginHorizontal: 16, backgroundColor: Colors.surface ?? '#FFFFFF', borderRadius: 22, overflow: 'hidden' },
  row: { paddingHorizontal: 18, paddingVertical: 14 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.line },
  rowPressed: { backgroundColor: 'rgba(40,36,28,0.04)' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flexShrink: 1, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 15, color: Colors.ink },
  amounts: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  of: { fontFamily: Typography.fontFamily.sans, fontSize: 13, color: Colors.ink3 },
  track: { marginTop: 10, height: 6, borderRadius: 3, backgroundColor: Colors.surface2 ?? '#F5F2EB', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: Colors.accent },
  fillDone: { backgroundColor: Colors.accent },
  caption: { marginTop: 6, fontFamily: Typography.fontFamily.sans, fontSize: 12, color: Colors.ink3 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: Colors.accentSoft },
  pillWarn: { backgroundColor: '#F6ECD9' },
  pillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 11, color: Colors.accent },
  pillTextWarn: { color: '#9A6B12' },
  label: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink4,
    fontFamily: Typography.fontFamily.sansBold,
  },
  input: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 16,
    color: Colors.ink,
    backgroundColor: Colors.surface2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  amountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: Colors.surface2,
  },
  currency: { fontFamily: Typography.fontFamily.serif, fontSize: 22, color: Colors.ink3 },
  amountInput: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    lineHeight: 40,
    color: Colors.ink,
    minWidth: 80,
    paddingVertical: 0,
    textAlign: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  switchLabel: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14.5, color: Colors.ink },
  dateRow: { marginTop: 10, alignItems: 'flex-start' },
  dateText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 15, color: Colors.accent },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderRadius: 999,
    padding: 3,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  segmentOn: { backgroundColor: Colors.surface },
  segmentText: { fontFamily: Typography.fontFamily.sans, fontSize: 13.5, color: Colors.ink3 },
  segmentTextOn: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.ink },
})
