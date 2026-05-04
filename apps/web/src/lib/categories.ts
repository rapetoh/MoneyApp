// Maps user-defined category names → one of the brand-sheet tint keys.
// The mobile app also assigns tints heuristically; this keeps web visual
// language aligned without requiring a schema change.
import { cat, type CategoryTint } from './theme'

const RULES: Array<[RegExp, CategoryTint]> = [
  [/coffee|cafe|espresso|tea|starbucks|blue bottle/i, 'coffee'],
  [/food|grocer|restaurant|dining|drink|snack|meal|trader joe/i, 'food'],
  [/transit|uber|lyft|taxi|gas|fuel|parking|metro|bus|train/i, 'transit'],
  [/shop|amazon|store|retail|cloth|apparel|book/i, 'shopping'],
  [/bill|util|netflix|spotify|subscription|rent|mortgage|electric|water|phone|internet/i, 'bills'],
  [/health|pharma|doctor|dentist|gym|fitness|walgreen|cvs/i, 'health'],
  [/work|office|business/i, 'work'],
]

export function tintFor(name: string | null | undefined): CategoryTint {
  if (!name) return 'other'
  for (const [re, tint] of RULES) {
    if (re.test(name)) return tint
  }
  return 'other'
}

export function tintColors(name: string | null | undefined): { bg: string; fg: string } {
  return cat[tintFor(name)]
}
