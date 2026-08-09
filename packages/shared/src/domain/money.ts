/**
 * The one aggregation module. Before this, "spend", "income" and
 * "saved" were each computed inline at 25+ call sites, and they
 * disagreed: three currency-field policies, three window regimes, two
 * recurring policies, and — the headline defect (05-F2) — **no
 * concept of a transfer**, so a $300 Schwab investment was counted as
 * consumption everywhere while every figure labelled "saved" read $0
 * on the same screen. Every surface that reports a total is meant to
 * route through `summarize()` below (Stage 2 wires the call sites;
 * this item builds and tests the module itself).
 *
 * FIX-PLAN 1.4 / audit findings: 05-F2, 05-F12, 05-F29, 05-F32,
 * 07-F8, 07-F28, 07-F29, 07-F30, 06-F34, 08-F13, 02-F17.
 */

import { isFxPending } from '../utils/fx'
import { roundCents } from '../utils/currency'
import type { TransactionDirection } from '../types/transaction'

/**
 * How a category (and therefore its transactions) contributes to the
 * aggregates below. Mirrors the `categories.kind` column the FIX-PLAN
 * adds in the migration this item does not own (Stage 2) — declared
 * here first so the classification rule has exactly one home whether
 * or not the column has landed yet on a given data source. `'spend'`
 * is the default for every category that isn't explicitly something
 * else; there is no implicit third state.
 */
export type CategoryKind = 'spend' | 'income' | 'transfer'

/**
 * How one transaction resolves for aggregation purposes. `'transfer'`
 * is the state that didn't exist before this item: money moved to
 * savings or an investment account is neither consumption nor new
 * income — it is still the user's money, just relocated.
 */
export type FlowKind = 'income' | 'expense' | 'transfer'

/**
 * Seeded category names that classify as a transfer when no explicit
 * `categoryKind` is available — i.e. every caller today, until Stage
 * 2's `categories.kind` migration and category-editor field land.
 * `default_categories` (`supabase/migrations/004_default_categories.sql:42`)
 * seeds exactly one such category. This table is the fallback, not
 * the destination: once a row carries a real `kind`, pass it and this
 * list is never consulted for that row.
 */
export const DEFAULT_TRANSFER_CATEGORY_NAMES: ReadonlySet<string> = new Set([
  'Savings & Investing',
])

/** The `byCategory` key used for transactions with no `category_id`. */
export const UNCATEGORIZED_CATEGORY_KEY = '__uncategorized__'

/**
 * Resolves the effective `CategoryKind` for a transaction: an
 * explicit kind wins when present (the eventual `categories.kind`
 * column, joined in by the caller); otherwise falls back to matching
 * the category name against `DEFAULT_TRANSFER_CATEGORY_NAMES`. Returns
 * `null` — not `'spend'` — when neither signal is available, so
 * `classifyFlow`'s own default (spend/income by direction) is the one
 * place that decision is made.
 */
export function resolveCategoryKind(
  categoryName?: string | null,
  explicitKind?: CategoryKind | null,
): CategoryKind | null {
  if (explicitKind != null) return explicitKind
  if (categoryName != null && DEFAULT_TRANSFER_CATEGORY_NAMES.has(categoryName)) {
    return 'transfer'
  }
  return null
}

/**
 * The one place the transfer/Savings & Investing classification rule
 * lives. `direction` decides income vs. expense by default; a
 * `'transfer'` category kind overrides both — a debit into Savings &
 * Investing is not consumption, and (for completeness, symmetric with
 * the enum) an `'income'` category kind overrides a debit the same
 * way a refund category might one day need to.
 */
export function classifyFlow(
  txn: { direction: TransactionDirection },
  categoryKind?: CategoryKind | null,
): FlowKind {
  if (categoryKind === 'transfer') return 'transfer'
  if (categoryKind === 'income') return 'income'
  return txn.direction === 'credit' ? 'income' : 'expense'
}

/**
 * True when a transaction counts as consumption spend. The one
 * predicate every "is this spend" call site should use instead of
 * `direction !== 'credit'`, which is what silently counted the $300
 * Schwab transfer as spend everywhere (05-F2, 08-F13, 02-F17).
 */
export function isSpend(
  txn: { direction: TransactionDirection },
  categoryKind?: CategoryKind | null,
): boolean {
  return classifyFlow(txn, categoryKind) === 'expense'
}

/**
 * Half-open window `summarize()` filters transactions into — the same
 * shape `packages/shared/src/utils/period.ts` (FIX-PLAN 1.3) returns
 * from `monthBounds()`/`periodBounds()`, so callers compose the two
 * without a field-name translation layer. Both bounds are ISO instant
 * strings compared lexicographically, which is only correct when
 * every `transacted_at` in the input and both bounds share the same
 * instant format (`Z`-suffixed UTC, as every write path in this repo
 * produces) — the same assumption 1.3's half-open bounds are built to
 * satisfy.
 */
export interface MoneyWindow {
  /** Inclusive. */
  start: string
  /** Exclusive. */
  endExclusive: string
}

/**
 * The structurally-typed shape `summarize()` needs from a
 * transaction. Deliberately not `import type { Transaction }` — this
 * runs over the Supabase row shape, the local SQLite shape and export
 * DTOs alike (same rationale as `aggAmount`), and over transactions
 * whose category has been joined in under different field names by
 * different callers.
 */
export interface SummarizableTransaction {
  amount_in_profile_currency?: number | null
  direction: TransactionDirection
  transacted_at: string
  category_id?: string | null
  category_name?: string | null
  /** Explicit category kind, once a caller has it (Stage 2). Falls
   *  back to `DEFAULT_TRANSFER_CATEGORY_NAMES` via `category_name`
   *  when omitted. */
  category_kind?: CategoryKind | null
}

export interface CategorySummary {
  categoryId: string
  categoryName: string | null
  /** Positive magnitude — the total spent in this category. */
  amount: number
  transactionCount: number
}

export interface MoneySummary {
  /** Sum of non-transfer credits. */
  income: number
  /** Sum of non-transfer debits — excludes transfers, which is the
   *  headline fix: a Savings & Investing debit no longer inflates
   *  this figure (05-F2). */
  expense: number
  /** Net movement into transfer-kind categories: `+debit`, `-credit`.
   *  Positive means money moved out of checking and into
   *  savings/investing during the window. */
  transfers: number
  /**
   * `income − expense`, unfloored, sign rendered explicitly. This is
   * the single definition that replaces the audit's six divergent
   * "saved" formulas (three distinct floored/unfloored variants
   * across five live surfaces plus a sixth in dead code — 05-F2).
   * Deliberately does **not** subtract `transfers`: moving money into
   * savings is not spending it, so it doesn't reduce how much was
   * "saved" this period.
   */
  saved: number
  /**
   * Same value as `saved`, exported under both names because the two
   * formulas the audit found (Overview's `saved`, MindMap's `net`)
   * are — once transfers are classified correctly — the same number.
   * Consolidating to one field would force every call site to agree
   * on which name to use before Stage 2 could wire them; exporting
   * both under one shared value lets each surface keep its existing
   * local name while guaranteeing they can never diverge again.
   */
  net: number
  /** Count of every transaction in the window, pending or not. */
  transactionCount: number
  /** Count of transactions in the window whose FX snapshot hasn't
   *  landed yet (`amount_in_profile_currency == null`). These are
   *  excluded from every monetary total above — never silently
   *  folded in as `0` (07-F8, 06-F34, 05-F12) — so a caller can
   *  render "N transactions awaiting conversion" whenever this is
   *  non-zero instead of a total that's quietly short. */
  pendingCount: number
  /** Full per-category expense breakdown — never truncated. Truncating
   *  here (top-6, top-8) and then labelling a sum over the truncated
   *  set "Total" is exactly 05-F36/05-F37; truncation belongs at the
   *  rendering layer, which can always recover it via
   *  `Object.values(byCategory)`. Transfer- and income-kind
   *  categories are excluded — `Object.values(byCategory).reduce((s,
   *  c) => s + c.amount, 0) === expense` by construction. Keyed by
   *  `category_id`, or `UNCATEGORIZED_CATEGORY_KEY`. */
  byCategory: Record<string, CategorySummary>
}

/**
 * The one aggregation entry point. Given a list of transactions and
 * an optional half-open window, returns income, expense (transfers
 * excluded), transfers, the one "saved" figure, transaction/pending
 * counts and the full per-category expense breakdown.
 *
 * Internally sums in integer cents (`Math.round(amount * 100)`,
 * summed as integers, divided back at the end) so a long series
 * cannot drift off a float rounding boundary (05-F32); every returned
 * figure is additionally passed through `roundCents()` as a backstop
 * for the window-filter/typeof boundary, not because the internal sum
 * needs it.
 *
 * Omit `window` to summarize the array as given — useful when the
 * caller has already filtered (e.g. a single day already sliced out).
 */
export function summarize(
  txns: readonly SummarizableTransaction[],
  window?: MoneyWindow,
): MoneySummary {
  const inWindow = window
    ? txns.filter((t) => t.transacted_at >= window.start && t.transacted_at < window.endExclusive)
    : txns

  let incomeCents = 0
  let expenseCents = 0
  let transferCents = 0
  let pendingCount = 0
  const byCategoryCents = new Map<
    string,
    { categoryId: string; categoryName: string | null; cents: number; count: number }
  >()

  for (const t of inWindow) {
    if (isFxPending(t)) {
      pendingCount++
      continue
    }
    const cents = Math.round((t.amount_in_profile_currency as number) * 100)
    const categoryKind = resolveCategoryKind(t.category_name, t.category_kind)
    const flow = classifyFlow(t, categoryKind)

    if (flow === 'income') {
      incomeCents += cents
    } else if (flow === 'transfer') {
      transferCents += t.direction === 'debit' ? cents : -cents
    } else {
      expenseCents += cents
      const key = t.category_id ?? UNCATEGORIZED_CATEGORY_KEY
      const bucket = byCategoryCents.get(key) ?? {
        categoryId: key,
        categoryName: t.category_name ?? null,
        cents: 0,
        count: 0,
      }
      bucket.cents += cents
      bucket.count += 1
      byCategoryCents.set(key, bucket)
    }
  }

  const income = roundCents(incomeCents / 100)
  const expense = roundCents(expenseCents / 100)
  const transfers = roundCents(transferCents / 100)
  const savedAndNet = roundCents((incomeCents - expenseCents) / 100)

  const byCategory: Record<string, CategorySummary> = {}
  for (const [key, bucket] of byCategoryCents) {
    byCategory[key] = {
      categoryId: bucket.categoryId,
      categoryName: bucket.categoryName,
      amount: roundCents(bucket.cents / 100),
      transactionCount: bucket.count,
    }
  }

  return {
    income,
    expense,
    transfers,
    saved: savedAndNet,
    net: savedAndNet,
    transactionCount: inWindow.length,
    pendingCount,
    byCategory,
  }
}
