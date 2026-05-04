// Shared types for the Overview lens components. The Overview page hands
// each lens the same shape; lenses do their own slicing/aggregation off
// this raw data.

export type LensTxn = {
  amount: number
  direction: 'debit' | 'credit'
  category_id: string | null
  category_name: string | null
  merchant: string | null
  merchant_domain: string | null
  transacted_at: string
  is_recurring: boolean
}

export type LensCategory = {
  id: string
  name: string
}

export type LensRecurring = {
  name: string | null
  amount: number
  frequency: string
}

export interface LensProps {
  transactions: LensTxn[]
  categories: LensCategory[]
  recurring: LensRecurring[]
  currency: string
  locale: string
  /** Inclusive start of the current month (00:00 local). */
  monthStart: Date
  /** Inclusive end of the current month (23:59:59 local). */
  monthEnd: Date
  /** "April" / "Avril" — already localized. */
  monthLabel: string
}

export type LensKey = 'mindmap' | 'flow' | 'calendar' | 'treemap' | 'cashflow' | 'matrix'

export const LENS_KEYS: LensKey[] = ['mindmap', 'flow', 'calendar', 'treemap', 'cashflow', 'matrix']

export function isLensKey(v: unknown): v is LensKey {
  return typeof v === 'string' && (LENS_KEYS as string[]).includes(v)
}

/** Map of category id -> name, used by lenses that need to resolve names. */
export function buildCategoryMap(cats: LensCategory[]): Record<string, string> {
  return Object.fromEntries(cats.map((c) => [c.id, c.name]))
}

/** Lens helper: filter to in-range debits with a resolved category name. */
export function monthDebits(p: LensProps): LensTxn[] {
  const out: LensTxn[] = []
  for (const t of p.transactions) {
    if (t.direction !== 'debit') continue
    const d = new Date(t.transacted_at)
    if (d < p.monthStart || d > p.monthEnd) continue
    out.push(t)
  }
  return out
}

export function monthCredits(p: LensProps): LensTxn[] {
  const out: LensTxn[] = []
  for (const t of p.transactions) {
    if (t.direction !== 'credit') continue
    const d = new Date(t.transacted_at)
    if (d < p.monthStart || d > p.monthEnd) continue
    out.push(t)
  }
  return out
}

/** Group transactions by category name (using "Uncategorized" for nulls). */
export function groupByCategory(txns: LensTxn[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txns) {
    const key = t.category_name ?? 'Uncategorized'
    out[key] = (out[key] ?? 0) + (t.amount || 0)
  }
  return out
}
