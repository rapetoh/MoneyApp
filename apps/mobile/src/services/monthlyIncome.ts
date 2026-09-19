import { t, type Locale } from '@voice-expense/shared'
import type { useTransactions } from '../hooks/useTransactions'

type CreateTransaction = ReturnType<typeof useTransactions>['createTransaction']

/**
 * Record a monthly income the one way the product knows: a credit
 * transaction flagged monthly-recurring. Its server trigger (migration 013)
 * creates the recurring rule, whose trigger (migration 032) writes
 * profiles.monthly_income. Shared by Settings and the Today "Getting
 * started" checklist, which replaced the onboarding income step (first-run
 * audit M2: income is asked where its reason is obvious, not before any
 * value).
 */
export async function addMonthlyIncome(
  createTransaction: CreateTransaction,
  input: { amount: number; source: string | null; currency: string; locale: Locale },
): Promise<boolean> {
  if (!(input.amount > 0)) return true
  const { error } = await createTransaction({
    amount: input.amount,
    direction: 'credit',
    currency_code: input.currency,
    merchant: input.source?.trim() || t('onboarding.income.default_name', input.locale),
    note: t('onboarding.income.txn_note', input.locale),
    category_id: null,
    payment_method: 'bank_transfer',
    is_recurring: true,
    recurring_frequency: 'monthly',
  })
  return !error
}
