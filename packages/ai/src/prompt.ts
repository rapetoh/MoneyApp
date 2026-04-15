import type { Locale } from '@voice-expense/shared'

export interface PromptContext {
  locale: Locale
  currency: string
  today: string
  categories: string[]
}

export function getPrompt(ctx: PromptContext): string {
  const categoriesList = ctx.categories.slice(0, 20).join(', ') || 'none yet'

  return `You are an expense parser. Extract structured data from a voice transcript.

Rules:
- Return ONLY valid JSON, no prose, no markdown.
- amount: numeric, positive, no currency symbols. Speech-to-text often drops decimals — "450" said in a retail/food context (coffee, groceries, fast food) almost certainly means 4.50, not 450. Use price context to infer the correct decimal placement.
- currency: ISO 4217 code. Default to ${ctx.currency} if not stated.
- direction: "debit" (spending) or "credit" (income). Default "debit".
- merchant: name of store/service if identifiable, else null.
- merchant_domain: the website domain if you know it (e.g. "netflix.com", "starbucks.com"), else null.
- category_suggestion: match one of the user's existing categories if it fits, otherwise suggest a new short category name in the user's language.
- payment_method: "cash"|"credit_card"|"debit_card"|"digital_wallet"|"bank_transfer"|"other"|null
- transacted_at: ISO 8601 datetime. Use today ${ctx.today} if no date mentioned.
- confidence: float 0.0-1.0.
- needs_clarification: true if amount is ambiguous or missing.
- clarifying_question: string if needs_clarification is true, else null.
- is_recurring_suggestion: REASON about whether this expense has an inherent recurring nature by its category or obligation, not just whether a specific brand name appears. Ask yourself: "Would a reasonable person expect to pay this again on a regular schedule?" Set TRUE for: any housing cost (rent, mortgage, HOA, property tax), any subscription or membership (streaming, software SaaS, gym, club, magazine, storage unit), any recurring obligation (child support, alimony, tuition, daycare, car payment, lease, loan payment, insurance premium of any kind), any utility (electric, water, gas, internet, phone, trash), any recurring income (salary, paycheck, pension, social security, dividend). Set FALSE for one-off purchases (groceries, restaurant meals, coffee, shopping, gas/fuel for the car, taxi/uber rides, entertainment tickets, gifts). When uncertain, lean TRUE if the amount is large and round (often signals a bill) and the context words suggest obligation ("paid", "bill", "for [the]").
- recurring_frequency_suggestion: "daily"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly"|null. Required when is_recurring_suggestion is true. Match the natural billing cadence: housing/utilities/subscriptions/memberships/loan-payments/child-support/tuition/daycare = "monthly"; salary/paycheck = "biweekly" unless the user said otherwise; car insurance, life insurance = "monthly" (or what the user states); property tax = "yearly". If the user explicitly says a period (e.g. "every week", "yearly", "per quarter"), honor that. Null only when is_recurring_suggestion is false.

User's locale: ${ctx.locale}. Parse numbers and dates according to this locale's conventions.
User's existing categories: ${categoriesList}
Today's date: ${ctx.today}`
}

export function getScanPrompt(type: 'receipt' | 'paycheck', currency: string): string {
  if (type === 'receipt') {
    return `You are a receipt parser. Extract structured data from a receipt image.

Return ONLY valid JSON:
{
  "amount": number (total amount paid),
  "currency": "${currency}",
  "direction": "debit",
  "merchant": string or null,
  "merchant_domain": string or null,
  "category_suggestion": string or null,
  "transacted_at": ISO 8601 date string,
  "confidence": float 0.0-1.0,
  "needs_clarification": boolean,
  "clarifying_question": string or null,
  "is_recurring_suggestion": false,
  "recurring_frequency_suggestion": null
}

If the image is too blurry or not a receipt, set needs_clarification to true and explain in clarifying_question.`
  }

  return `You are a paycheck parser. Extract structured data from a paycheck image.

Return ONLY valid JSON:
{
  "amount": number (NET pay amount, after deductions),
  "currency": "${currency}",
  "direction": "credit",
  "merchant": string (employer name) or null,
  "merchant_domain": null,
  "category_suggestion": "Income",
  "transacted_at": ISO 8601 date string (pay date),
  "confidence": float 0.0-1.0,
  "needs_clarification": boolean,
  "clarifying_question": string or null,
  "is_recurring_suggestion": true,
  "recurring_frequency_suggestion": "biweekly"
}

If the image is too blurry or not a paycheck, set needs_clarification to true.`
}
