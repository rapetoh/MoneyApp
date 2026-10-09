/**
 * Learned merchant categories (migration 041, Oct 2026).
 *
 * Moving a transaction to another category teaches Murmur that merchant's
 * home; the next capture from it is filed there before the AI's guess.
 * One key per merchant however the bank spells it: the descriptor cleaner
 * strips store numbers and processor prefixes, then everything but letters
 * and digits goes, so "STARBUCKS #04412", "Starbucks" and "SQ *STARBUCKS"
 * all read "starbucks".
 */
import { cleanMerchantDescriptor, normalizeMerchantCase } from './merchantBrand'

export interface MerchantRule {
  merchant_key: string
  merchant_name: string
  category_id: string
}

/** The rule key for a merchant, or `null` when nothing identifying is left. */
export function merchantKey(merchant: string | null | undefined): string | null {
  if (!merchant) return null
  const cleaned = cleanMerchantDescriptor(merchant) || merchant
  const key = cleaned
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 120)
  return key.length > 0 ? key : null
}

/** How the merchant reads in the rules list. */
export function merchantRuleName(merchant: string): string {
  return (normalizeMerchantCase(cleanMerchantDescriptor(merchant)) || merchant).trim().slice(0, 200)
}

/**
 * The learned category for `merchant`, if any. `validCategoryIds` guards
 * against a rule pointing at a category this device no longer lists
 * (archived since): such a rule is ignored rather than filing into a
 * hidden category.
 */
export function learnedCategoryFor(
  merchant: string | null | undefined,
  rules: readonly MerchantRule[],
  validCategoryIds?: ReadonlySet<string>,
): string | null {
  const key = merchantKey(merchant)
  if (!key) return null
  const rule = rules.find((r) => r.merchant_key === key)
  if (!rule) return null
  if (validCategoryIds && !validCategoryIds.has(rule.category_id)) return null
  return rule.category_id
}
