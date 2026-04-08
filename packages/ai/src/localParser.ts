import type { ParsedExpense } from '@voice-expense/shared'

// Patterns that match simple expense inputs without needing AI
// Handles English, French, Spanish, Portuguese number conventions

const AMOUNT_PATTERNS = [
  // "50 dollars", "$50", "50.00", "50,00" (EU format)
  /(?:\$|€|£|¥)?\s*(\d{1,6}(?:[.,]\d{2})?)\s*(?:dollars?|euros?|pounds?|bucks?|usd|eur|gbp)?/i,
]

const MERCHANT_PATTERNS = [
  // "at Starbucks", "chez Starbucks", "en Starbucks", "no Starbucks"
  /(?:at|chez|en|no|@)\s+([A-Za-zÀ-ÿ\s']+?)(?:\s*,|\s*$)/i,
]

function parseAmount(transcript: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = transcript.match(pattern)
    if (match) {
      const raw = match[1].replace(',', '.')
      const amount = parseFloat(raw)
      if (!isNaN(amount) && amount > 0) return amount
    }
  }
  return null
}

function parseMerchant(transcript: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const match = transcript.match(pattern)
    if (match) return match[1].trim()
  }
  return null
}

export function parseExpenseLocally(transcript: string): {
  result: ParsedExpense | null
  confidence: number
} {
  const amount = parseAmount(transcript)
  if (!amount) return { result: null, confidence: 0 }

  const merchant = parseMerchant(transcript)
  const confidence = merchant ? 0.87 : 0.75

  // Only skip AI if confidence is high enough
  if (confidence < 0.85) return { result: null, confidence }

  const result: ParsedExpense = {
    amount,
    currency: 'USD', // Will be overridden by user's currency setting
    direction: 'debit',
    merchant,
    merchant_domain: null,
    category_suggestion: null,
    payment_method: null,
    transacted_at: new Date().toISOString(),
    confidence,
    needs_clarification: false,
    clarifying_question: null,
  }

  return { result, confidence }
}
