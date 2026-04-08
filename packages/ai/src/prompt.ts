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
- amount: numeric, positive, no currency symbols.
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
  "clarifying_question": string or null
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
  "clarifying_question": string or null
}

If the image is too blurry or not a paycheck, set needs_clarification to true.`
}
