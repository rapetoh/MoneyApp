/**
 * The one category-name → user-category resolver — fix-plan item 2.9(d)
 * ("Parse semantics: the rules the prompt never had"). Before this, the
 * AI's free-text `category_suggestion` ("Rent", "Investing") was matched
 * against the user's own categories by a four-stage substring cascade
 * living in `VoiceConfirmModal.tsx`: exact match, then
 * `category.includes(suggestion)`, then `suggestion.includes(category)`,
 * then a same-token substring check. The `.includes()` stages don't
 * respect word boundaries, so "Rent" filed under "Entertainment" with
 * high confidence and no visible warning —
 * `"entertainment".toLowerCase().includes("rent")` is `true`. This module
 * is the deterministic replacement, tried in order:
 *
 *  1. Exact match on `name_normalized` (case-insensitive — already how
 *     every category is stored; see `useCategories.createCategory`).
 *  2. A curated synonym table: phrases that name a *kind* of spend
 *     rather than a literal category name ("rent", "paycheck") map onto
 *     the category name the app actually seeds
 *     (`supabase/migrations/004_default_categories.sql`). Only fires
 *     when that target category actually exists in the user's own list
 *     — a synonym maps onto a real category, it never invents one.
 *  3. Token overlap, whole words only (never a substring of a word) and
 *     a minimum score. Below the threshold this returns `null` rather
 *     than guessing, so the caller can leave the category unselected and
 *     offer "create this category" instead of silently mis-filing the
 *     transaction.
 */
import type { Category } from '../types/category'

/** Curated phrase → canonical category name. Each pattern is matched
 *  with word boundaries against the normalized suggestion, so "rent"
 *  never matches inside a longer word. Covers the phrases stage 3's
 *  plain token overlap would miss entirely — "401k" and "Savings &
 *  Investing" share no token — plus the plan's own worked examples
 *  (fix-plan 2.9: "rent/mortgage → Housing, internet/electric →
 *  Utilities, investing/401k/IRA → Savings & Investing, salary/paycheck
 *  → Income"). */
const SYNONYM_TABLE: ReadonlyArray<{ pattern: RegExp; categoryName: string }> = [
  { pattern: /\b(rent|mortgage)\b/i, categoryName: 'Housing' },
  {
    pattern: /\b(internet|electric|electricity|utility|utilities)\b/i,
    categoryName: 'Utilities',
  },
  {
    pattern: /\b(investing|invest|investment|investments|401k|401\(k\)|ira|brokerage)\b/i,
    categoryName: 'Savings & Investing',
  },
  { pattern: /\b(salary|paycheck|payroll|wages?)\b/i, categoryName: 'Income' },
]

/** Tokens shorter than this are dropped before the overlap comparison —
 *  "&", "of", "to" carry no matching signal and would otherwise inflate
 *  the score on unrelated categories. */
const MIN_TOKEN_LENGTH = 3

/** Minimum shared-token count before stage 3 will commit to a match.
 *  One whole-word hit is deliberately enough — the word-boundary
 *  requirement above is what makes that safe (unlike the old
 *  `.includes()` cascade, a single matched token here is never a
 *  substring accident). */
const MIN_TOKEN_OVERLAP_SCORE = 1

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(/[\s&,/-]+/)
    .filter((w) => w.length >= MIN_TOKEN_LENGTH)
}

/** Whole-word overlap between two token sets, scored by shared-token
 *  count. Deliberately does not fall back to `.includes()` — "rent" is
 *  not a token of "entertainment" at all, so the bug this module exists
 *  to fix cannot recur regardless of the score threshold. */
function tokenOverlapScore(a: readonly string[], b: readonly string[]): number {
  let score = 0
  for (const token of a) {
    if (b.includes(token)) score += 1
  }
  return score
}

export type CategoryResolutionStrategy = 'exact' | 'synonym' | 'token_overlap'

export interface CategoryResolution {
  category: Category
  /** Which stage produced the match — callers that want to distinguish a
   *  confident exact match from a fuzzy one can branch on this; today no
   *  caller needs to. */
  strategy: CategoryResolutionStrategy
}

/**
 * Resolves a free-text category suggestion (the AI's `category_suggestion`,
 * or any other free-text guess) against the user's own categories.
 * Returns `null` — never a low-confidence guess — when nothing clears the
 * token-overlap threshold; the caller is expected to leave the category
 * unselected and offer to create a new one from the suggestion text
 * rather than silently filing the transaction under the wrong bucket.
 */
export function resolveCategorySuggestion(
  suggestion: string | null | undefined,
  categories: readonly Category[],
): CategoryResolution | null {
  const raw = (suggestion ?? '').trim()
  if (!raw || categories.length === 0) return null
  const normalized = normalize(raw)

  // Stage 1 — exact match on name_normalized.
  const exact = categories.find((c) => c.name_normalized === normalized)
  if (exact) return { category: exact, strategy: 'exact' }

  // Stage 2 — curated synonym table.
  for (const { pattern, categoryName } of SYNONYM_TABLE) {
    if (!pattern.test(normalized)) continue
    const target = categories.find((c) => c.name_normalized === normalize(categoryName))
    if (target) return { category: target, strategy: 'synonym' }
  }

  // Stage 3 — token overlap, whole words only, minimum score.
  const suggestionTokens = tokens(normalized)
  if (suggestionTokens.length === 0) return null
  let best: { category: Category; score: number } | null = null
  for (const c of categories) {
    const score = tokenOverlapScore(suggestionTokens, tokens(c.name))
    if (score > 0 && (!best || score > best.score)) best = { category: c, score }
  }
  if (best && best.score >= MIN_TOKEN_OVERLAP_SCORE) {
    return { category: best.category, strategy: 'token_overlap' }
  }
  return null
}

// ── Merchant-name → default category (Apple Pay capture, Aug 17 2026) ──────
//
// The card network hands over merchant strings like "Canteen Des Moines 2",
// "Three Square Market Vending", "SHELL 4412", "UBER *TRIP", "WALGREENS".
// The AI parser is the refinement, but a Wallet capture saves in the
// background with a hard time budget, so a first-pass local guess must be
// instant. Names are matched against the *default* seed categories
// (supabase/migrations/004_default_categories.sql); a user who renamed or
// deleted one simply gets no guess. Ordered: first match wins.
const MERCHANT_KEYWORDS: ReadonlyArray<{ pattern: RegExp; categoryName: string }> = [
  {
    pattern:
      /\b(uber|lyft|taxi|cab|metro|transit|mta|bart|parking|park(ing)?\s?mobile|amtrak|greyhound)\b/i,
    categoryName: 'Transport',
  },
  {
    pattern:
      /\b(shell|exxon|mobil|chevron|bp|citgo|sunoco|marathon|maverik|casey'?s|kum\s?&?\s?go|speedway|wawa|sheetz|circle\s?k|7-?eleven|gas|fuel|petro)\b/i,
    categoryName: 'Transport',
  },
  {
    pattern:
      /\b(walmart|target|costco|sam'?s club|amazon|amzn|best ?buy|apple store|ikea|home ?depot|lowe'?s|dollar (tree|general)|tj ?maxx|marshalls|macy'?s|nike|zara|h&m|shein|temu|ebay|etsy)\b/i,
    categoryName: 'Shopping',
  },
  {
    pattern:
      /\b(kroger|aldi|hy-?vee|trader joe'?s|whole foods|safeway|publix|wegmans|heb|h-e-b|meijer|lidl|food ?lion|giant|stop ?& ?shop|grocery|market ?basket|fareway|sprouts)\b/i,
    categoryName: 'Groceries',
  },
  {
    pattern:
      /\b(walgreens|cvs|rite ?aid|pharmacy|clinic|dental|dentist|hospital|urgent care|medical|md|dr\.?|optical|vision)\b/i,
    categoryName: 'Health & Medical',
  },
  {
    pattern:
      /\b(netflix|spotify|hulu|disney\+?|hbo|max|apple\.com\/bill|itunes|google \*?(play|storage|one)|youtube|prime video|paramount|peacock|adobe|microsoft|openai|chatgpt|icloud|dropbox|planet fitness|anytime fitness|gym)\b/i,
    categoryName: 'Subscriptions',
  },
  {
    pattern:
      /\b(delta|united|american air|southwest|jetblue|spirit|frontier|airbnb|marriott|hilton|hyatt|hotel|motel|expedia|booking\.com|hertz|avis|enterprise rent)\b/i,
    categoryName: 'Travel',
  },
  {
    pattern:
      /\b(amc|cinemark|regal|theat(er|re)|cinema|steam|playstation|xbox|nintendo|ticketmaster|stubhub|bowling|golf|arcade|dave ?& ?buster)\b/i,
    categoryName: 'Entertainment',
  },
  {
    pattern: /\b(salon|barber|spa|nails?|sephora|ulta|massage|beauty)\b/i,
    categoryName: 'Personal Care',
  },
  { pattern: /\b(petco|petsmart|chewy|vet(erinary)?|animal hospital)\b/i, categoryName: 'Pets' },
  {
    pattern:
      /\b(canteen|vending|vend|snack|cafe|caf[eé]|coffee|starbucks|dunkin|mcdonald'?s|burger|pizza|taco|chipotle|subway|wendy'?s|chick-?fil-?a|kfc|popeyes|panera|domino'?s|papa john|sonic|arby'?s|dairy queen|culver'?s|five guys|shake shack|panda express|restaurant|grill|bistro|diner|kitchen|bakery|donut|doughnut|deli|sushi|ramen|pho|thai|bbq|steak|wings|buffet|peking|wok|hibachi|doordash|uber ?eats|grubhub|instacart|bar\b|pub\b|brew|tavern|lounge)\b/i,
    categoryName: 'Food & Dining',
  },
]

/** Instant local guess from a card-network merchant string, resolved
 *  against the user's own categories. Null when nothing matches or the
 *  user lacks the seed category. */
export function guessCategoryFromMerchant(
  merchant: string | null | undefined,
  categories: readonly Category[],
): CategoryResolution | null {
  const raw = (merchant ?? '').trim()
  if (!raw || categories.length === 0) return null
  for (const { pattern, categoryName } of MERCHANT_KEYWORDS) {
    if (!pattern.test(raw)) continue
    const target = categories.find((c) => c.name_normalized === normalize(categoryName))
    if (target) return { category: target, strategy: 'synonym' }
  }
  return null
}
