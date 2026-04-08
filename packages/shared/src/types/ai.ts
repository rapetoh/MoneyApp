import type { PaymentMethod, TransactionDirection } from './transaction'

export interface ParsedExpense {
  amount: number
  currency: string
  direction: TransactionDirection
  merchant: string | null
  merchant_domain: string | null
  category_suggestion: string | null
  payment_method: PaymentMethod | null
  transacted_at: string // ISO 8601
  confidence: number // 0.0 - 1.0
  needs_clarification: boolean
  clarifying_question: string | null
}

export interface AdvisorContext {
  monthly_income: number | null
  avg_monthly_spend_last_3mo: number
  top_categories: { name: string; avg_monthly: number }[]
  recurring_expenses: { name: string; amount: number; frequency: string }[]
  current_month_spent: number
  safe_to_spend_remaining: number
  implied_monthly_savings: number
  user_question: string
}
