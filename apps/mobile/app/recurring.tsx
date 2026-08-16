import { useCallback, useMemo, useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../src/hooks/useAuth'
import { useProfile } from '../src/hooks/useProfile'
import { useManualRefresh } from '../src/hooks/useManualRefresh'
import { useCategories } from '../src/hooks/useCategories'
import { useRecurringRules, computeNextOccurrence, isRuleOverdue } from '../src/hooks/useRecurringRules'
import { MerchantAvatar } from '../src/components/MerchantAvatar'
import { Money } from '../src/components/Money'
import { RecurringRuleEditor, type RecurringRuleFormValues } from '../src/components/RecurringRuleEditor'
import { Colors, Typography, Hairline } from '../src/theme'
import { formatCurrency, monthlyEquivalent, t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'
import type { RecurringRule, RecurringFrequency } from '@voice-expense/shared'

// The hand-rolled `TO_MONTHLY` table (fix-plan 2.1) is deleted — the hero
// below now calls the shared `monthlyEquivalent`, which honours
// `rule.interval` (03-F23) instead of assuming every rule is interval 1.

const FREQ_KEY: Record<RecurringFrequency, string> = {
  daily: 'recurring.daily',
  weekly: 'recurring.weekly',
  biweekly: 'recurring.biweekly',
  monthly: 'recurring.monthly',
  quarterly: 'recurring.quarterly',
  yearly: 'recurring.yearly',
}

// Compact "/mo" / "/wk" tag rendered beneath the amount on each row. Mockup
// shows "/MO" for the monthly-heavy preview — we keep the shape for every
// frequency so the visual rhythm holds. Localized (audit 01-F29/08-F48,
// fix-plan 4.2) — these six were the last hard-coded English literals on
// this screen.
const FREQ_SHORT_KEY: Record<RecurringFrequency, string> = {
  daily: 'recurring.short_daily',
  weekly: 'recurring.short_weekly',
  biweekly: 'recurring.short_biweekly',
  monthly: 'recurring.short_monthly',
  quarterly: 'recurring.short_quarterly',
  yearly: 'recurring.short_yearly',
}

/** "Overdue — pending generation" (fix-plan 2.1 / 03-F24) rather than a
 *  stale past date sorted as imminent: a rule whose mechanically-next
 *  occurrence (from its own `last_generated`) already fell in the past
 *  means generation hasn't caught up yet, not that nothing is due until
 *  that date. */
function formatNextDue(rule: RecurringRule, locale: Locale): string {
  if (isRuleOverdue(rule)) return t('recurring.overdue', locale)
  const next = computeNextOccurrence(rule)
  if (!next) return '—'
  return next.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

/** FX-aware monthly equivalent (fix-plan 2.1): uses the rule's own
 *  profile-currency snapshot (migration 025) when it has landed, so a
 *  EUR rule and a USD rule on a USD profile don't sum as if both were
 *  already dollars. Falls back to the raw amount only while the
 *  snapshot is pending (never null-coalesces to 0 — a pending rule is
 *  simply not counted, same "pending, not zero" contract as
 *  `packages/shared/src/domain/money.ts`). */
function monthlyEquivalentFx(rule: RecurringRule): number {
  const amount = rule.amount_in_profile_currency ?? rule.amount
  return monthlyEquivalent({ frequency: rule.frequency, interval: rule.interval, amount })
}

export default function RecurringScreen() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { categories, createCategory } = useCategories(user?.id)
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family) — a failed
  // read used to render identically to "no recurring rules yet"
  // (`rules` stays `[]` either way).
  const { rules, loading, error, createRule, toggleRule, deleteRule, updateRule, refetch } =
    useRecurringRules(user?.id)
  const { refreshing, onRefresh } = useManualRefresh(user?.id, [refetch])

  // Create/edit sheet (fix-plan 3.3 — "Add manually" + tapping a rule to
  // edit it, the two lifecycle actions this screen never had). One sheet,
  // one component, driven by `editorMode` — mirrors every other
  // create/edit pair in the app (BudgetEditorModal, IncomeEditorModal)
  // rather than a second hand-rolled form.
  const [editorVisible, setEditorVisible] = useState(false)
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create')
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)

  function openCreate() {
    setEditorMode('create')
    setEditingRule(null)
    setEditorVisible(true)
  }
  // `?new=1` — Ask Murmur's "Add a recurring rule" action (SPEC §1.4).
  const params = useLocalSearchParams<{ new?: string }>()
  useEffect(() => {
    if (params.new === '1') openCreate()
  }, [params.new])

  function openEdit(rule: RecurringRule) {
    setEditorMode('edit')
    setEditingRule(rule)
    setEditorVisible(true)
  }

  async function handleEditorSave(values: RecurringRuleFormValues): Promise<boolean> {
    if (editorMode === 'edit' && editingRule) {
      return updateRule(editingRule.id, values)
    }
    const created = await createRule(values)
    return created != null
  }

  // useRecurringRules fetches once on mount, but this screen stays in the
  // navigation stack between visits — so a rule created elsewhere (e.g. by
  // onboarding's income step or the transaction edit screen) wouldn't show
  // up here unless we refetch. Focus event covers FAB tap + tab switch +
  // deep links + navigate-back from a child screen.
  useFocusEffect(
    useCallback(() => {
      refetch()
    }, [refetch]),
  )
  const router = useRouter()
  const [toggling, setToggling] = useState<string | null>(null)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'

  // Category lookup used to colour the fallback tile when a rule has no
  // merchant (e.g. manually-named "Rent").
  const categoryById = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>()
    categories.forEach((c) => m.set(c.id, { name: c.name, color: c.color ?? null }))
    return m
  }, [categories])

  // Monthly-equivalent OUTFLOW total across every active *debit* rule —
  // never conflated with income (fix-plan 2.1's "Done when": a 4000/mo
  // credit rule alongside a 15/mo debit rule must produce a hero of 15,
  // not 4015). Yearly projection is the × 12 of that so the serif
  // sentence reads honestly for any mix.
  const monthlyTotal = useMemo(() => {
    return rules
      .filter((r) => r.is_active && r.direction === 'debit')
      .reduce((sum, r) => sum + monthlyEquivalentFx(r), 0)
  }, [rules])
  const yearlyProjection = Math.round(monthlyTotal * 12)

  // The credit-rule twin, rendered as its own labelled figure (never
  // netted into or hidden behind the outflow hero above) whenever the
  // user has at least one active income rule.
  const inflowMonthly = useMemo(() => {
    return rules
      .filter((r) => r.is_active && r.direction === 'credit')
      .reduce((sum, r) => sum + monthlyEquivalentFx(r), 0)
  }, [rules])

  // Active/Paused as two real sections (fix-plan 3.3's "Why now": this
  // list used to render every rule — active *and* paused — under one
  // heading that read "Active subscriptions", with only a dimmed row
  // style to tell them apart.
  const activeRules = useMemo(() => rules.filter((r) => r.is_active), [rules])
  const pausedRules = useMemo(() => rules.filter((r) => !r.is_active), [rules])
  // Expenses and income as two labelled lists (build 12 feedback: one
  // undifferentiated "Active" list of $1,000 / $1,500 / $42 / $300 rows gave
  // the reader no way to tie the $342 hero to anything). Each section
  // header carries its own monthly subtotal — the same two numbers the
  // hero shows, so hero and list visibly agree.
  const activeExpenses = useMemo(() => activeRules.filter((r) => r.direction === 'debit'), [activeRules])
  const activeIncome = useMemo(() => activeRules.filter((r) => r.direction === 'credit'), [activeRules])

  function handleRowPress(rule: RecurringRule) {
    // Action sheet via Alert — preserves the shipped pause/resume + delete
    // affordances the mockup's row layout doesn't show, and now Edit
    // (fix-plan 3.3 — this screen was previously a viewer: pause/resume/
    // delete only, no way to create or edit a rule from here at all).
    // Destructive delete is last, matching iOS convention.
    Alert.alert(
      rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale),
      t(FREQ_KEY[rule.frequency], locale) + ' · ' + formatCurrency(rule.amount, rule.currency_code, locale),
      [
        {
          text: t('detail.edit', locale),
          onPress: () => openEdit(rule),
        },
        {
          text: rule.is_active ? t('recurring.pause', locale) : t('recurring.resume', locale),
          onPress: async () => {
            setToggling(rule.id)
            await toggleRule(rule.id, !rule.is_active)
            setToggling(null)
          },
        },
        {
          text: t('detail.delete', locale),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('recurring.delete_confirm', locale),
              rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale),
              [
                { text: t('common.cancel', locale), style: 'cancel' },
                {
                  text: t('detail.delete', locale),
                  style: 'destructive',
                  onPress: () => deleteRule(rule.id),
                },
              ],
            )
          },
        },
        { text: t('common.cancel', locale), style: 'cancel' },
      ],
    )
  }

  return (
    <>
      {/* Hide the native Stack header — the mockup renders its own chevron pill + breadcrumb. */}
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* Back pill + breadcrumb (comes from the More drawer) + Add
            manually (fix-plan 3.3 — this screen had no create affordance
            at all; a rule could only ever be created by flagging a
            transaction or accepting a detected pattern). Sibling of the
            ScrollView, not its first child — a child scrolls off screen
            (audit 01-F32); matches more/transactions.tsx's `topRow`. */}
        <View style={styles.topRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backPill, pressed && styles.backPillPressed]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.ink2 ?? Colors.textSecondary} />
          </Pressable>
          <Text style={styles.breadcrumb}>{t('more.title', locale)}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [styles.addPill, pressed && styles.addPillPressed]}
            hitSlop={8}
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text style={styles.addPillText}>{t('recurring.add_manually', locale)}</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.ink3} />}
        >
          {/* Title block */}
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{t('recurring.eyebrow', locale)}</Text>
            <Text style={styles.headline}>{t('recurring.heading', locale)}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 48 }} />
          ) : error && rules.length === 0 ? (
            // Error+retry state (fix-plan 2.13) instead of the "no rules
            // yet" empty copy, which used to be reachable for a failed
            // read exactly as readily as for a genuinely rule-free account.
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={40} color={Colors.destructive ?? '#A94646'} />
              <Text style={styles.emptyTitle}>{t('common.load_failed', locale)}</Text>
              <Pressable
                onPress={refetch}
                style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
              >
                <Ionicons name="refresh" size={14} color="#FFFFFF" />
                <Text style={styles.retryBtnText}>{t('common.retry', locale)}</Text>
              </Pressable>
            </View>
          ) : rules.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔄</Text>
              <Text style={styles.emptyTitle}>{t('recurring.empty', locale)}</Text>
              <Text style={styles.emptySub}>{t('recurring.empty_sub', locale)}</Text>
              {/* The one action every user can reach regardless of plan
                  (fix-plan 3.3 — "never name a control that is rendered
                  disabled": unlike the detected-patterns banner, which is
                  Plus-gated, this button always works). */}
              <Pressable
                onPress={openCreate}
                style={({ pressed }) => [styles.emptyAddBtn, pressed && styles.emptyAddBtnPressed]}
              >
                <Ionicons name="add" size={14} color="#FFFFFF" />
                <Text style={styles.emptyAddBtnText}>{t('recurring.add_manually', locale)}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Hero: monthly OUTFLOW total + yearly projection. Income rules
                  never contribute here (fix-plan 2.1) — they get their own
                  labelled line below instead of being netted in silently. */}
              <View style={styles.heroWrap}>
                <View style={styles.heroCard}>
                  {/* Two figures, each named for what it is. "Paid monthly …
                      a year in subscriptions" mislabelled a savings
                      transfer as a subscription and never said the figure
                      excluded income (build 12 feedback). */}
                  <Text style={styles.heroEyebrow}>{t('recurring.expenses_per_month', locale)}</Text>
                  <View style={styles.heroAmountRow}>
                    <Money value={monthlyTotal} size={46} currencyCode={currency} locale={locale} />
                    <Text style={styles.heroPer}>{t('recurring.per_month', locale)}</Text>
                  </View>
                  <Text style={styles.heroSummary}>
                    {t('recurring.yearly_prefix', locale)}{' '}
                    <Text style={styles.heroSummaryStrong}>
                      {formatCurrency(yearlyProjection, currency, locale)}
                    </Text>{' '}
                    {t('recurring.yearly_suffix', locale)}
                  </Text>
                  {inflowMonthly > 0 && (
                    <View style={styles.heroInflowRow}>
                      <Text style={styles.heroInflowLabel}>{t('recurring.income_per_month', locale)}</Text>
                      <View style={styles.heroInflowAmount}>
                        <Money
                          value={inflowMonthly}
                          size={20}
                          currencyCode={currency}
                          locale={locale}
                          color={Colors.income}
                        />
                        <Text style={styles.heroPerSmall}>{t('recurring.per_month', locale)}</Text>
                      </View>
                    </View>
                  )}
                  <Text style={styles.heroFootnote}>{t('recurring.hero_footnote', locale)}</Text>
                </View>
              </View>

              {/* Active / Paused as two real sections (fix-plan 3.3) —
                  previously one flat list under an "Active subscriptions"
                  heading that included paused rules too, told apart only
                  by a dimmed row style. */}
              {activeExpenses.length > 0 && (
                <View style={styles.sectionWrap}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionLabel}>{t('recurring.expenses_section', locale)}</Text>
                    <Text style={styles.sectionTotal}>
                      {formatCurrency(monthlyTotal, currency, locale)}{t('recurring.short_monthly', locale)}
                    </Text>
                  </View>
                  <View style={styles.listCard}>
                    {activeExpenses.map((rule, i) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        isLast={i === activeExpenses.length - 1}
                        isToggling={toggling === rule.id}
                        currency={currency}
                        locale={locale}
                        categoryById={categoryById}
                        onPress={() => handleRowPress(rule)}
                      />
                    ))}
                  </View>
                </View>
              )}
              {activeIncome.length > 0 && (
                <View style={styles.sectionWrap}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionLabel}>{t('recurring.income_section', locale)}</Text>
                    <Text style={[styles.sectionTotal, { color: Colors.income }]}>
                      {formatCurrency(inflowMonthly, currency, locale)}{t('recurring.short_monthly', locale)}
                    </Text>
                  </View>
                  <View style={styles.listCard}>
                    {activeIncome.map((rule, i) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        isLast={i === activeIncome.length - 1}
                        isToggling={toggling === rule.id}
                        currency={currency}
                        locale={locale}
                        categoryById={categoryById}
                        onPress={() => handleRowPress(rule)}
                      />
                    ))}
                  </View>
                </View>
              )}
              {pausedRules.length > 0 && (
                <View style={styles.sectionWrap}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionLabel}>{t('recurring.paused_section', locale)}</Text>
                  </View>
                  <View style={styles.listCard}>
                    {pausedRules.map((rule, i) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        isLast={i === pausedRules.length - 1}
                        isToggling={toggling === rule.id}
                        currency={currency}
                        locale={locale}
                        categoryById={categoryById}
                        onPress={() => handleRowPress(rule)}
                      />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Create/edit sheet (fix-plan 3.3). */}
      <RecurringRuleEditor
        visible={editorVisible}
        mode={editorMode}
        initial={editingRule}
        categories={categories}
        onCreateCategory={createCategory}
        defaultCurrency={currency}
        locale={locale}
        tz={profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
        onSave={handleEditorSave}
        onClose={() => setEditorVisible(false)}
      />
    </>
  )
}

/** One row in the Active or Paused list — factored out so both sections
 *  render the identical row shape (fix-plan 3.3's split). */
function RuleRow({
  rule,
  isLast,
  isToggling,
  currency,
  locale,
  categoryById,
  onPress,
}: {
  rule: RecurringRule
  isLast: boolean
  isToggling: boolean
  currency: string
  locale: Locale
  categoryById: Map<string, { name: string; color: string | null }>
  onPress: () => void
}) {
  const cat = rule.category_id ? categoryById.get(rule.category_id) : null
  const ruleLabel = rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale)
  const isCredit = rule.direction === 'credit'
  // "≈ $2,166.67/mo" under any cadence that isn't plain monthly, so the
  // section subtotal above the list is reproducible row by row.
  const monthlyEq = monthlyEquivalentFx(rule)
  const showMonthlyEq = !(rule.frequency === 'monthly' && (rule.interval || 1) === 1)
  const statusLabel = rule.is_active
    ? `${t('recurring.next_due', locale)} ${formatNextDue(rule, locale)}`
    : t('recurring.paused', locale)
  return (
    <Pressable
      onPress={onPress}
      // No role/label previously (audit 03-F36's "same defect elsewhere"
      // note) — VoiceOver read the row's child `<Text>`s individually with
      // no indication the row itself opens the edit/delete action sheet.
      accessibilityRole="button"
      accessibilityLabel={`${ruleLabel}, ${statusLabel}`}
      style={({ pressed }) => [
        styles.ruleRow,
        !isLast && styles.ruleRowDivider,
        !rule.is_active && styles.ruleRowInactive,
        pressed && styles.ruleRowPressed,
      ]}
    >
      <MerchantAvatar
        merchant={rule.name}
        size={36}
        radius={10}
        categoryName={cat?.name ?? null}
        categoryColor={cat?.color ?? null}
      />
      <View style={styles.ruleInfo}>
        <Text style={styles.ruleName} numberOfLines={1}>
          {rule.name ?? formatCurrency(rule.amount, rule.currency_code, locale)}
        </Text>
        <Text style={styles.ruleNext} numberOfLines={1}>
          {rule.is_active
            ? `${t('recurring.next_due', locale)} · ${formatNextDue(rule, locale)}`
            : t('recurring.paused', locale)}
        </Text>
      </View>
      <View style={styles.ruleAmountCol}>
        {isToggling ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <>
            <Money
              value={isCredit ? rule.amount : -rule.amount}
              size={14}
              serif={false}
              sansWeight="700"
              currencyCode={rule.currency_code || currency}
              locale={locale}
              color={isCredit ? Colors.income : undefined}
            />
            <Text style={styles.ruleFreqTag}>{t(FREQ_SHORT_KEY[rule.frequency], locale)}</Text>
            {showMonthlyEq && (
              <Text style={styles.ruleMonthlyEq} numberOfLines={1}>
                {'≈ '}{formatCurrency(monthlyEq, currency, locale)}{t('recurring.short_monthly', locale)}
              </Text>
            )}
          </>
        )}
      </View>
    </Pressable>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — trace S_Recurring in docs/money-app/project/mobile-screens-5.jsx.
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 40 },

  topRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPillPressed: { opacity: 0.6 },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  addPillPressed: { opacity: 0.8 },
  addPillText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  breadcrumb: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.ink3 ?? Colors.textSecondary,
  },

  intro: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 4,
  },
  eyebrow: {
    color: Colors.ink4 ?? Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  headline: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 4,
  },

  heroWrap: { paddingHorizontal: 20, paddingTop: 12 },
  heroCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  heroEyebrow: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 6,
  },
  heroPer: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 14,
    fontFamily: Typography.fontFamily.sans,
  },
  heroSummary: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.ink2 ?? Colors.textSecondary,
    marginTop: 12,
  },
  heroSummaryStrong: {
    color: Colors.ink ?? Colors.text,
    fontWeight: '700',
  },
  heroInflowRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: Hairline.width,
    borderTopColor: 'rgba(40,36,28,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroInflowLabel: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
    flexShrink: 1,
  },
  heroInflowAmount: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  heroPerSmall: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.fontFamily.sans,
  },
  heroFootnote: {
    marginTop: 12,
    fontSize: 11.5,
    lineHeight: 16,
    color: Colors.ink4 ?? Colors.textMuted,
    fontFamily: Typography.fontFamily.sans,
  },

  sectionWrap: { paddingHorizontal: 16, paddingTop: 24 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 8,
  },
  sectionLabel: {
    color: Colors.ink3 ?? Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: Typography.fontFamily.sansBold,
  },
  sectionTotal: {
    color: Colors.ink2 ?? Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
    fontVariant: ['tabular-nums'],
  },
  listCard: {
    backgroundColor: Colors.surface2 ?? Colors.card,
    borderRadius: 22,
    overflow: 'hidden',
  },
  ruleRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ruleRowDivider: {
    borderBottomWidth: Hairline.width,
    borderBottomColor: Hairline.color,
  },
  ruleRowInactive: { opacity: 0.5 },
  ruleRowPressed: { backgroundColor: 'rgba(40,36,28,0.04)' },
  ruleInfo: { flex: 1, minWidth: 0 },
  ruleName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: Colors.ink ?? Colors.text,
    letterSpacing: -0.2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  ruleNext: {
    fontSize: 12,
    color: Colors.ink3 ?? Colors.textSecondary,
    marginTop: 1,
    fontFamily: Typography.fontFamily.sans,
  },
  ruleAmountCol: {
    alignItems: 'flex-end',
  },
  ruleFreqTag: {
    fontSize: 10.5,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  ruleMonthlyEq: {
    fontSize: 10.5,
    color: Colors.ink4 ?? Colors.textMuted,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 17,
    color: Colors.ink ?? Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  retryBtnPressed: { opacity: 0.8 },
  retryBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  emptyAddBtnPressed: { opacity: 0.8 },
  emptyAddBtnText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
