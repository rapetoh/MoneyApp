import { useMemo, useState } from 'react'
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, Pressable, RefreshControl} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../../src/hooks/useAuth'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useCategories } from '../../src/hooks/useCategories'
import { useProfile } from '../../src/hooks/useProfile'
import { useActiveBudget, budgetStatusFor } from '../../src/hooks/useBudget'
import { useRecurringRules } from '../../src/hooks/useRecurringRules'
import { useManualRefresh } from '../../src/hooks/useManualRefresh'
import { RecurringPatternBanner } from '../../src/components/RecurringPatternBanner'
import type { RecurringPatternCandidate } from '../../src/services/recurringPatternDetector'
import { usePlusStatus } from '../../src/hooks/usePlusStatus'
import { syncManager } from '../../src/services/sync/SyncManager'
import { TransactionRow } from '../../src/components/TransactionRow'
import { Money, MoneyLabel } from '../../src/components/Money'
import { MiniBars } from '../../src/components/MiniBars'
import { DayOneFirstLog } from '../../src/components/DayOneFirstLog'
import { Colors, Typography, Spacing, Hairline, useTabBarClearance } from '../../src/theme'
import {
  t,
  aggAmount,
  formatMoney,
  localParts,
  localDay,
  monthBounds,
  monthIso,
  daysBetween,
  addDays,
  civilDateTimeToInstant,
} from '@voice-expense/shared'
import type { Locale, Transaction } from '@voice-expense/shared'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — all civil-date math routes through packages/shared/src/utils/
// period.ts (fix-plan 1.3/2.4); `Date` is only ever used as scratch space
// handed to `Intl`-backed formatters (`toLocaleDateString(..., { timeZone })`),
// never read via a local getter.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Today feed = recent activity, bounded by time and never silently
 * truncated (owner decision, Aug 16 2026): the last 7 civil days (in `tz`),
 * grouped by day — Today · Yesterday · "Saturday, August 15" … — extended
 * further back only when those 7 days hold fewer than `MIN_FEED_ROWS`
 * transactions (a quiet week, a new user), and always followed by a
 * "See all N transactions" row (rendered by the screen) so the full ledger
 * is one tap away and the user always knows more exists. Replaces the
 * April 19 rule (Today + Yesterday + two older days, cut without a hint),
 * which was a mockup read too literally: on a real month it hid the
 * biggest day (owner screenshot Aug 16: Aug 11 with both paychecks).
 * Days with nothing logged are not rendered.
 */
interface Section {
  key: string
  label: string
  data: Transaction[]
}
const FEED_DAYS = 7
const MIN_FEED_ROWS = 8

function groupForToday(txns: Transaction[], locale: Locale, nowIso: string, tz: string): Section[] {
  const today = localParts(nowIso, tz)
  const todayDayIso = localDay(nowIso, tz)
  const yestCivil = addDays(today.y, today.m, today.d, -1)
  // Noon anchor (not midnight) so the instant this resolves to can never
  // land on the adjacent civil day across a DST transition.
  const yestInstant = civilDateTimeToInstant(yestCivil.y, yestCivil.m, yestCivil.d, 12, 0, 0, tz)
  const yestDayIso = localDay(yestInstant, tz)
  const cutoffCivil = addDays(today.y, today.m, today.d, -(FEED_DAYS - 1))
  const cutoffDayIso = localDay(civilDateTimeToInstant(cutoffCivil.y, cutoffCivil.m, cutoffCivil.d, 12, 0, 0, tz), tz)

  // Newest first; bucket by civil day.
  const live = txns.filter((t) => !t.is_deleted).slice().sort((a, b) => (a.transacted_at < b.transacted_at ? 1 : a.transacted_at > b.transacted_at ? -1 : 0))
  const buckets = new Map<string, { label: string; items: Transaction[] }>()
  let rowsInWindow = 0
  for (const txn of live) {
    const dayIso = localDay(txn.transacted_at, tz)
    const inWindow = dayIso >= cutoffDayIso
    // Past the 7-day window: keep adding whole days only while the feed is
    // still short of MIN_FEED_ROWS.
    if (!inWindow && rowsInWindow >= MIN_FEED_ROWS && !buckets.has(dayIso)) break
    const d = new Date(txn.transacted_at)
    let label: string
    if (dayIso === todayDayIso) {
      label = `${t('transactions.today', locale)} · ${d.toLocaleDateString(locale, { weekday: 'long', timeZone: tz })}`
    } else if (dayIso === yestDayIso) {
      label = `${t('transactions.yesterday', locale)} · ${d.toLocaleDateString(locale, { weekday: 'long', timeZone: tz })}`
    } else {
      label = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz })
    }
    const bucket = buckets.get(dayIso) ?? { label, items: [] }
    bucket.items.push(txn)
    buckets.set(dayIso, bucket)
    rowsInWindow += 1
  }
  // Map insertion order is newest-day first already (input sorted desc).
  return Array.from(buckets, ([key, v]) => ({ key, label: v.label, data: v.items }))
}

/** Last 7 days of spending indexed Mon..Sun, in `tz`. The rightmost bar is
 *  always today's own weekday column (`localParts(nowIso, tz).weekdayIndex`
 *  — already Monday=0..Sunday=6, `period.ts`'s `WEEK_START` convention). */
function weeklySpendBars(txns: Transaction[], nowIso: string, tz: string): number[] {
  const today = localParts(nowIso, tz)
  const values = Array(7).fill(0) as number[]
  for (const txn of txns) {
    if (txn.is_deleted || txn.direction !== 'debit') continue
    const txnParts = localParts(txn.transacted_at, tz)
    // Civil days between the transaction's own local day and today's —
    // positive when today is later, exactly the "how many days ago" the
    // original device-local version computed, but zone-correct.
    const diff = daysBetween(txnParts.y, txnParts.m, txnParts.d, today.y, today.m, today.d)
    if (diff < 0 || diff > today.weekdayIndex) continue
    const idx = today.weekdayIndex - diff
    values[idx] += aggAmount(txn)
  }
  return values
}

/** Days left in the current *calendar* month, in `tz` — the countdown this
 *  card's "left this month" caption actually describes (a quick-glance
 *  monthly snapshot, independent of whatever period the user's budget is
 *  configured on; the Budgets tab's own hero renders the budget's real
 *  period-aligned countdown via `budgetStatusFor()`/`daysLeftInWindow`). */
function daysLeftInMonth(nowIso: string, tz: string): number {
  const bounds = monthBounds(monthIso(nowIso, tz), tz)
  const now = localParts(nowIso, tz)
  const end = localParts(bounds.endExclusive, tz)
  return Math.max(1, daysBetween(now.y, now.m, now.d, end.y, end.m, end.d))
}

/** Compact budget-header amount: "$473" — the shared formatter's
 *  `precision: 'compact'` mode (no decimals for a quick-glance figure),
 *  replacing the deleted four-case `$/€/£/¥` glyph ternary and the
 *  hard-coded `toLocaleString('en-US')` grouping (audit 01-F6/01-F21). */
function formatBudgetShort(amount: number, currency: string, locale: string): string {
  return formatMoney(amount, currency, locale, { precision: 'compact' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function TodayScreen() {
  // Clears the floating tab bar (audit 01-F13, fix-plan 1.8/2.14) — replaces
  // the hand-picked `paddingBottom: 140` literal.
  const tabBarClearance = useTabBarClearance()
  const { user } = useAuth()
  // Read-error exposure (fix-plan 2.13 / audit 08-F21 family) — both hooks
  // already expose `error`; this screen is the one that wasn't consuming
  // it, so a failed read rendered identically to "no transactions yet" /
  // "no budget set" instead of a real error-with-retry state.
  const { transactions, loading, error: transactionsError } = useTransactions(user?.id)
  const { categoryMap } = useCategories(user?.id)
  const { profile } = useProfile(user?.id)
  const { budget, error: budgetError, refetch: refetchBudget } = useActiveBudget(user?.id)
  const { rules: recurringRules, createRule } = useRecurringRules(user?.id)
  const { refreshing, onRefresh } = useManualRefresh(user?.id, [refetchBudget])
  const router = useRouter()

  // Auto-recurring detection is a Plus feature (PRD §11 / DESIGN.md §10).
  // Free-tier users still flag recurring transactions manually via the edit
  // screen — they just don't get the proactive "we noticed a pattern" nudge.
  const { isPlus } = usePlusStatus()

  // "New pattern detected" accept handler. Creates a recurring rule from the
  // candidate; the detector will exclude this pattern on subsequent runs
  // (matched by amount + name against the active rules).
  async function acceptPattern(c: RecurringPatternCandidate): Promise<boolean> {
    const rule = await createRule({
      name: c.merchant || null,
      amount: c.amount,
      currency_code: c.currency_code,
      category_id: c.category_id,
      direction: c.direction,
      payment_method: c.payment_method,
      note: null,
      frequency: c.frequency,
      template_txn_id: c.templateTxnId,
    })
    return rule != null
  }

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  // profiles.timezone (fix-plan 1.3) — every window/label this screen
  // renders comes from here, never the device's own zone, so this screen
  // agrees with Budgets/Insights/web about which day/month/week a
  // transaction belongs to.
  const tz = profile?.timezone || 'UTC'

  // Frozen for the life of this mount (mirrors `insights.tsx`'s own
  // `nowInstant`) rather than recomputed every render — every date-derived
  // value below stays internally consistent within one render pass.
  const nowInstant = useMemo(() => new Date().toISOString(), [])

  const sections = useMemo(
    () => groupForToday(transactions, locale, nowInstant, tz),
    [transactions, locale, nowInstant, tz],
  )
  const liveCount = useMemo(() => transactions.filter((x) => !x.is_deleted).length, [transactions])
  const weekly = useMemo(() => weeklySpendBars(transactions, nowInstant, tz), [transactions, nowInstant, tz])
  const todayDow = useMemo(() => localParts(nowInstant, tz).weekdayIndex, [nowInstant, tz])
  const daysLeft = useMemo(() => daysLeftInMonth(nowInstant, tz), [nowInstant, tz])
  const monthLabel = useMemo(
    () => new Date(nowInstant).toLocaleDateString(locale, { month: 'long', timeZone: tz }).toUpperCase(),
    [locale, tz, nowInstant],
  )
  const spentToday = useMemo(() => {
    const todayDayIso = localDay(nowInstant, tz)
    return transactions
      .filter((tx) => !tx.is_deleted && tx.direction === 'debit' && localDay(tx.transacted_at, tz) === todayDayIso)
      .reduce((sum, tx) => sum + aggAmount(tx), 0)
  }, [transactions, nowInstant, tz])

  // The one budget-status computation (fix-plan 2.5/2.1) — replaces the
  // deleted `usePeriodSpend(budget, transactions)` two-argument legacy
  // path plus `computeUpcomingRecurring`, whose four defects (summed raw
  // `rule.amount` across currencies, counted only the *next* occurrence,
  // and derived its window from a `biweekly` branch that ended *today*)
  // are exactly what `budgetStatusFor` fixes. Clamped at 0 for this
  // quick-glance caption the same way the deleted code was — `budgets.tsx`
  // is where an over-budget figure gets its own explicit "over by" state.
  const budgetStatus = useMemo(
    () => budgetStatusFor(budget, transactions, recurringRules, tz),
    [budget, transactions, recurringRules, tz],
  )
  // Not clamped: an over-budget week reads "over by $237", never "$0 left"
  // (owner screenshot Aug 16: a $700 weekly budget $237 over rendered as
  // "$0 left this month · 16 days to go"). Caption and countdown follow the
  // budget's own period/window, not the calendar month.
  const leftThisPeriod = budgetStatus ? budgetStatus.remaining : null
  const budgetPeriodKey = budget?.period === 'weekly'
    ? 'home.left_this_week'
    : budget?.period === 'monthly'
      ? 'home.left_this_month'
      : 'home.left_this_period'
  const budgetDaysLeft = useMemo(() => {
    if (!budgetStatus) return daysLeft
    const now = localParts(nowInstant, tz)
    const end = localParts(budgetStatus.window.endExclusive, tz)
    return Math.max(1, daysBetween(now.y, now.m, now.d, end.y, end.m, end.d))
  }, [budgetStatus, nowInstant, tz, daysLeft])

  // Day-1 coach surface: show until the user has logged anything, unless they
  // tap Skip this session. Persistence is intentionally not wired — if the
  // user quits without logging, the hint reappears next launch, which is the
  // right behavior (the goal is "get them over the first-log hump"). Never
  // shown on a failed read — a read failure with zero cached rows is not
  // the same fact as "you haven't logged anything yet" (fix-plan 2.13).
  const [daySkipped, setDaySkipped] = useState(false)
  const showDayOne = !loading && transactions.length === 0 && !transactionsError && !daySkipped

  if (showDayOne) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <DayOneFirstLog
          locale={locale}
          onSkip={() => setDaySkipped(true)}
          // Straight to Quick entry — the manual flow's post-redesign home.
          onTypeInstead={() => router.push('/transaction/new')}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.ink3} />}
      >
        {/* Header — APRIL / Today + manual entry + Ask Murmur + History.
            The + pill (voice redesign) is the old manual flow's new home:
            the mic FAB is now the default way to log, and typing lives
            here beside the existing AI entry. */}
        <View style={styles.header}>
          <View>
            <Text style={styles.monthTag}>{monthLabel}</Text>
            <Text style={styles.title}>{t('transactions.today', locale)}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => router.push('/transaction/new')}
              accessibilityLabel={t('nav.add_expense', locale)}
            >
              <Ionicons name="add" size={20} color={Colors.ink2 ?? Colors.textSecondary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => router.push('/more/ask')}
              accessibilityLabel={t('ask.title', locale)}
            >
              <Ionicons
                name="sparkles"
                size={18}
                color={Colors.accent ?? Colors.primary}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
              onPress={() => router.push('/more/transactions')}
              accessibilityLabel={t('more.transactions', locale)}
            >
              <Ionicons name="list-outline" size={18} color={Colors.ink2 ?? Colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Budget one-liner — a visible error+retry state (fix-plan 2.13)
            when the budget itself failed to load, rather than silently
            falling through to "no budget set" (`leftThisPeriod == null`
            reads identically for both otherwise). */}
        {budgetError && !budget ? (
          <Pressable
            onPress={refetchBudget}
            style={({ pressed }) => [styles.budgetErrorLine, pressed && styles.budgetErrorLinePressed]}
          >
            <Ionicons name="alert-circle-outline" size={14} color={Colors.destructive ?? '#A94646'} />
            <Text style={styles.budgetErrorText}>
              {t('common.load_failed', locale)} · {t('common.retry', locale)}
            </Text>
          </Pressable>
        ) : (
          leftThisPeriod != null && (
            <View style={styles.budgetLine}>
              <Text style={styles.budgetLeft}>
                <Text style={[styles.budgetLeftAccent, leftThisPeriod < 0 && styles.budgetOverAccent]}>
                  {formatBudgetShort(Math.abs(leftThisPeriod), currency, locale)}
                </Text>
                <Text style={styles.budgetLeftRest}>
                  {' '}
                  {leftThisPeriod < 0 ? t('home.over_budget_suffix', locale) : t(budgetPeriodKey, locale)}
                </Text>
              </Text>
              <Text style={styles.budgetRight}>
                {budgetDaysLeft} {t(leftThisPeriod < 0 && budget?.period === 'weekly' ? 'home.days_left_week' : 'home.days_to_go', locale)}
              </Text>
            </View>
          )
        )}

        {/* "New pattern detected" recurring banner — Plus-gated. Free users
            still see all their data; they just don't get proactive recurring
            suggestions and instead manually flag rules from the edit screen. */}
        {isPlus && (
          <RecurringPatternBanner
            transactions={transactions}
            existingRules={recurringRules}
            locale={locale}
            onAccept={acceptPattern}
          />
        )}

        {/* Spent today + MiniBars */}
        <View style={styles.spentCard}>
          <View style={{ flex: 1 }}>
            <MoneyLabel>{t('home.spent_today', locale)}</MoneyLabel>
            <View style={{ marginTop: 4 }}>
              <Money value={spentToday} size={32} currencyCode={currency} locale={locale} />
            </View>
          </View>
          <MiniBars values={weekly} todayIndex={todayDow} />
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={styles.loading} />
        ) : transactionsError && sections.length === 0 ? (
          <View style={styles.errorState}>
            <Ionicons name="alert-circle-outline" size={32} color={Colors.destructive ?? '#A94646'} />
            <Text style={styles.errorTitle}>{t('common.load_failed', locale)}</Text>
            <Pressable
              onPress={() => user?.id && syncManager.pullRemote(user.id)}
              style={({ pressed }) => [styles.errorRetryBtn, pressed && styles.errorRetryBtnPressed]}
            >
              <Ionicons name="refresh" size={14} color="#FFFFFF" />
              <Text style={styles.errorRetryText}>{t('common.retry', locale)}</Text>
            </Pressable>
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💸</Text>
            <Text style={styles.emptyTitle}>{t('transactions.empty', locale)}</Text>
            <Text style={styles.emptySubtitle}>{t('home.first_expense', locale)}</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {sections.map((section) => (
              <View key={section.key}>
                <Text style={styles.sectionHead}>{section.label.toUpperCase()}</Text>
                <View style={styles.sectionCard}>
                  {section.data.map((txn, i) => (
                    <TransactionRow
                      key={txn.id}
                      transaction={txn}
                      categoryName={txn.category_id ? categoryMap[txn.category_id]?.name : null}
                      categoryColor={txn.category_id ? categoryMap[txn.category_id]?.color : null}
                      currency={currency}
                      locale={locale}
                      showDivider={i > 0}
                      onPress={() => router.push(`/transaction/${txn.id}`)}
                    />
                  ))}
                </View>
              </View>
            ))}
            {/* Always: the bridge to the full ledger, with the real count —
                the feed above is recent activity, never "everything". */}
            <Pressable
              onPress={() => router.push('/more/transactions')}
              style={({ pressed }) => [styles.seeAllRow, pressed && styles.seeAllRowPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.seeAllText}>
                {t('home.see_all_transactions', locale).replace('{count}', String(liveCount))}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={Colors.ink3} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  seeAllRow: {
    marginTop: 6,
    marginHorizontal: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAllRowPressed: { opacity: 0.7 },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink2,
    fontFamily: Typography.fontFamily.sansSemiBold,
  },
  // `paddingBottom` set per-instance above from `useTabBarClearance()`
  // (audit 01-F13, fix-plan 1.8/2.14).
  content: {},

  // APRIL / Today row
  header: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  monthTag: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansSemiBold,
    color: Colors.ink4 ?? Colors.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    // Big, bold, sans display — matches the mockup's T.fDisp size 34 weight 700.
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: Colors.ink ?? Colors.text,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: Colors.line ?? 'rgba(0,0,0,0.06)',
  },
  headerIconBtnPressed: { opacity: 0.6 },

  // Budget line
  budgetLine: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetLeft: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink3 ?? Colors.textSecondary,
  },
  budgetLeftAccent: {
    fontFamily: Typography.fontFamily.sansBold,
    fontWeight: '700',
    color: Colors.accent ?? Colors.primary,
  },
  budgetLeftRest: {
    fontFamily: Typography.fontFamily.sans,
    fontWeight: '500',
  },
  budgetOverAccent: { color: Colors.destructive },
  budgetRight: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.sans,
    color: Colors.ink4 ?? Colors.textMuted,
    fontWeight: '500',
  },

  // Budget error+retry line (fix-plan 2.13) — same slot as `budgetLine`,
  // rendered instead of it when the budget read itself failed.
  budgetErrorLine: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  budgetErrorLinePressed: { opacity: 0.6 },
  budgetErrorText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '600',
    color: Colors.destructive ?? '#A94646',
  },

  // Spent today card
  spentCard: {
    marginHorizontal: 22,
    marginBottom: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // List
  listWrap: { gap: 0 },
  sectionHead: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 8,
    fontSize: 12,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: Colors.ink4 ?? Colors.textMuted,
  },
  sectionCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },

  loading: {
    marginTop: Spacing['2xl'],
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.ink ?? Colors.text,
  },
  emptySubtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.sm,
    color: Colors.ink3 ?? Colors.textSecondary,
    textAlign: 'center',
  },

  // Read-failure state (fix-plan 2.13) — replaces the transactions-empty
  // state when zero rows is the *symptom of a failed read*, not the
  // honest "nothing logged yet" fact.
  errorState: {
    alignItems: 'center',
    paddingTop: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  errorTitle: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size.md,
    color: Colors.ink ?? Colors.text,
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.ink ?? '#1B1915',
  },
  errorRetryBtnPressed: { opacity: 0.8 },
  errorRetryText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
