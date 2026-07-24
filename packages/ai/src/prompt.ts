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
  "payment_method": "cash"|"credit_card"|"debit_card"|"digital_wallet"|"bank_transfer"|"other"|null,
  "transacted_at": ISO 8601 date string,
  "confidence": float 0.0-1.0,
  "needs_clarification": boolean,
  "clarifying_question": string or null,
  "is_recurring_suggestion": false,
  "recurring_frequency_suggestion": null
}

payment_method: read it off the receipt where possible. Common signals:
- "VISA / MASTERCARD / AMEX / DISCOVER" with a last-4 or "CREDIT" or "DEBIT" label → "credit_card" or "debit_card" (use the label; if only the brand is shown without credit/debit, prefer "credit_card").
- "DEBIT" / "CHECK CARD" / "EFTPOS" → "debit_card".
- "CASH" / "CASH TENDERED" / "CHANGE DUE" → "cash".
- "APPLE PAY" / "GOOGLE PAY" / "SAMSUNG PAY" / mobile-wallet logo → "digital_wallet".
- ACH / wire / bank transfer language → "bank_transfer".
- Anything else (gift card, store credit, EBT) → "other".
- If the receipt does not show the payment method at all, return null. Do not guess "cash" — null is the honest answer.

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
  "payment_method": "bank_transfer",
  "transacted_at": ISO 8601 date string (pay date),
  "confidence": float 0.0-1.0,
  "needs_clarification": boolean,
  "clarifying_question": string or null,
  "is_recurring_suggestion": true,
  "recurring_frequency_suggestion": "weekly"|"biweekly"|"monthly"|null
}

recurring_frequency_suggestion: determine the cadence from the pay-period dates on the stub. Two consecutive periods ~7 days apart → "weekly"; ~14 days → "biweekly"; once a calendar month → "monthly". Semimonthly paychecks (1st & 15th, or 15th & end-of-month) are common in the US but cannot be represented in the current enum — return null in that case so the user picks manually. Also return null when only one pay period is visible and you cannot infer cadence. Do not default to "biweekly" — the cadence varies widely by employer and country, and a wrong guess pre-fills the user's recurring rule with the wrong frequency.

payment_method: paychecks land in the user's bank account via direct deposit, so default to "bank_transfer".

If the image is too blurry or not a paycheck, set needs_clarification to true.`
}
