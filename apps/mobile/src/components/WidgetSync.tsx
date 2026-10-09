/**
 * Keeps the home-screen and lock-screen widgets (targets/widget) current.
 *
 * The widget shows exactly what the top of Today shows: spent today and
 * the budget left (or "over budget"), formatted here by the app's own
 * money formatter and i18n so the two never disagree. The snapshot goes
 * to a keychain item shared with the widget, through modules/murmur-widget;
 * the native side
 * reloads the widget only when the text actually changed.
 *
 * Two values age on their own: "today" after midnight and the budget once
 * its period ends. The snapshot carries the day and the period end, so the
 * widget shows a fresh day (zero spent) and a full budget without waiting
 * for the app to open. Renders nothing.
 */
import { useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useTransactions } from '../hooks/useTransactions'
import { useActiveBudget, budgetStatusFor } from '../hooks/useBudget'
import { useRecurringRules } from '../hooks/useRecurringRules'
import { useNowInstant } from '../hooks/useNowInstant'
import { setWidgetSnapshot } from '../../modules/murmur-widget/src'
import { aggAmount, formatMoney, localDay, t } from '@voice-expense/shared'
import type { Locale } from '@voice-expense/shared'

export type WidgetSnapshot = {
  v: 1
  tz: string
  /** Civil day (in `tz`) the `spentToday` figure belongs to. */
  day: string
  spentToday: string
  /** Shown instead of `spentToday` once `day` is in the past. */
  zero: string
  budget: {
    /** "$473" (absolute value). */
    amount: string
    /** "left this month" or "over budget". */
    label: string
    over: boolean
    /** Period end (ISO instant); after it the widget shows `fresh*`. */
    endsAt: string
    freshAmount: string
    freshLabel: string
  } | null
  labels: { spentToday: string; speak: string; type: string }
}

export function WidgetSync() {
  const { user, loading: authLoading } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const { budget } = useActiveBudget(user?.id)
  const { rules } = useRecurringRules(user?.id)

  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const tz = profile?.timezone || 'UTC'
  const nowInstant = useNowInstant(tz)

  const snapshot = useMemo<string | null>(() => {
    if (!user?.id || !profile) return null
    const day = localDay(nowInstant, tz)
    const spent = transactions
      .filter((tx) => !tx.is_deleted && tx.direction === 'debit' && localDay(tx.transacted_at, tz) === day)
      .reduce((sum, tx) => sum + aggAmount(tx), 0)

    const status = budgetStatusFor(budget, transactions, rules, tz)
    const periodKey =
      budget?.period === 'weekly'
        ? 'home.left_this_week'
        : budget?.period === 'monthly'
          ? 'home.left_this_month'
          : 'home.left_this_period'
    const short = (n: number) => formatMoney(n, currency, locale, { precision: 'whole' })

    const snap: WidgetSnapshot = {
      v: 1,
      tz,
      day,
      spentToday: formatMoney(spent, currency, locale),
      zero: formatMoney(0, currency, locale),
      budget:
        status && budget
          ? {
              amount: short(Math.abs(status.remaining)),
              label: status.remaining < 0 ? t('home.over_budget_suffix', locale) : t(periodKey, locale),
              over: status.remaining < 0,
              endsAt: status.window.endExclusive,
              freshAmount: short(budget.amount),
              freshLabel: t(periodKey, locale),
            }
          : null,
      labels: {
        spentToday: t('home.spent_today', locale),
        speak: t('widget.speak', locale),
        type: t('widget.type', locale),
      },
    }
    return JSON.stringify(snap)
  }, [user?.id, profile, transactions, budget, rules, tz, currency, locale, nowInstant])

  useEffect(() => {
    // Signed out: clear, so the widget never shows the last person's money.
    if (authLoading) return
    if (!user?.id) {
      setWidgetSnapshot(null)
      return
    }
    if (snapshot) setWidgetSnapshot(snapshot)
  }, [authLoading, user?.id, snapshot])

  return null
}
