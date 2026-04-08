import type { AdvisorContext } from '@voice-expense/shared'

export function buildAdvisorContext(data: {
  monthlyIncome: number | null
  transactions: {
    amount: number
    direction: string
    category_name: string | null
    transacted_at: string
  }[]
  recurringRules: { name: string | null; amount: number; frequency: string }[]
  currentMonthSpent: number
  safeToSpendRemaining: number
  userQuestion: string
}): AdvisorContext {
  const {
    monthlyIncome,
    transactions,
    recurringRules,
    currentMonthSpent,
    safeToSpendRemaining,
    userQuestion,
  } = data

  // Compute avg monthly spend over last 3 months
  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const recentDebits = transactions.filter(
    (t) => t.direction === 'debit' && new Date(t.transacted_at) >= threeMonthsAgo,
  )
  const avgMonthlySpend = recentDebits.reduce((sum, t) => sum + t.amount, 0) / 3

  // Top categories by spend
  const categoryTotals = new Map<string, number>()
  recentDebits.forEach((t) => {
    const cat = t.category_name ?? 'Uncategorized'
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + t.amount)
  })
  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, total]) => ({ name, avg_monthly: total / 3 }))

  const impliedMonthlySavings = monthlyIncome ? Math.max(0, monthlyIncome - avgMonthlySpend) : 0

  return {
    monthly_income: monthlyIncome,
    avg_monthly_spend_last_3mo: Math.round(avgMonthlySpend * 100) / 100,
    top_categories: topCategories,
    recurring_expenses: recurringRules.map((r) => ({
      name: r.name ?? 'Unknown',
      amount: r.amount,
      frequency: r.frequency,
    })),
    current_month_spent: currentMonthSpent,
    safe_to_spend_remaining: safeToSpendRemaining,
    implied_monthly_savings: Math.round(impliedMonthlySavings * 100) / 100,
    user_question: userQuestion,
  }
}
