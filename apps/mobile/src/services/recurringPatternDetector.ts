import type { Transaction, RecurringRule, RecurringFrequency } from '@voice-expense/shared'

/**
 * Recurring-pattern detector.
 *
 * Per DESIGN.md §"Retention mechanics": "Recurring detection kicks in after
 * 2–3 occurrences of a merchant + amount pattern." This module is the pure
 * logic side — it scans the user's transactions, returns candidate
 * subscriptions / bills the user might want to mark recurring. The Today
 * screen consumes the output and renders the "new pattern detected" banner;
 * accepting creates a real rule via `useRecurringRules.createRule`,
 * dismissing pins a SecureStore flag (handled at the call site).
 *
 * Heuristics:
 *  - Group transactions by (merchant lowercased, amount rounded to nearest
 *    cent). A 1-cent FX wobble between months would otherwise split a single
 *    pattern into two phantom patterns.
 *  - Require ≥2 occurrences. Per the design doc lower bound; we err on the
 *    side of suggesting too early rather than too late, since the user can
 *    dismiss.
 *  - Require ≥21-day spread between the earliest and latest occurrence (a
 *    month-ish — long enough that two same-day transactions of the same
 *    amount don't trigger a "you have a subscription" pop-up).
 *  - Skip transactions already flagged `is_recurring`.
 *  - Skip patterns covered by an existing active rule (matched by amount +
 *    name, case-insensitive).
 *  - Skip credits (income detection is its own thing).
 *  - Frequency is inferred from the median gap between occurrences:
 *      ≤9 days   → weekly
 *      10–20     → biweekly
 *      21–45     → monthly  (default for the "subscription" sweet spot)
 *      46–95     → quarterly
 *      >95       → yearly
 */

interface CandidateInput {
  transactions: Transaction[]
  existingRules: RecurringRule[]
  /** Optional: keys of patterns the user has explicitly dismissed. The
   *  detector simply skips these so the Today banner doesn't surface them
   *  again. */
  dismissedKeys?: ReadonlySet<string>
}

export interface RecurringPatternCandidate {
  /** Stable, hashable key (merchant lower + cents). Use to record dismissal
   *  in SecureStore + as a React `key`. */
  key: string
  merchant: string
  amount: number
  currency_code: string
  occurrences: number
  /** ISO date of the most recent occurrence — used for "Last seen Apr 12". */
  lastSeenAt: string
  /** Best guess at the natural cadence based on inter-occurrence gaps. */
  frequency: RecurringFrequency
  /** The most-recent transaction that anchors the candidate; passed as the
   *  `template_txn_id` when the user accepts. */
  templateTxnId: string
  /** Inherited from the most-recent transaction so accepting creates a
   *  fully-specified rule. */
  category_id: string | null
  payment_method: string | null
  direction: 'debit' | 'credit'
}

const MIN_OCCURRENCES = 2
const MIN_DAYS_SPREAD = 21
const DAY_MS = 24 * 60 * 60 * 1000

function patternKey(merchant: string | null, amount: number): string {
  const cents = Math.round(amount * 100)
  const m = (merchant ?? '').toLowerCase().trim()
  return `${m}|${cents}`
}

function inferFrequency(daysGap: number): RecurringFrequency {
  if (daysGap <= 9) return 'weekly'
  if (daysGap <= 20) return 'biweekly'
  if (daysGap <= 45) return 'monthly'
  if (daysGap <= 95) return 'quarterly'
  return 'yearly'
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m]
}

export function detectRecurringPatterns({
  transactions,
  existingRules,
  dismissedKeys,
}: CandidateInput): RecurringPatternCandidate[] {
  // Build a quick-lookup of existing rule keys so we don't re-suggest a
  // pattern the user has already accepted.
  const existingKeys = new Set<string>()
  for (const r of existingRules) {
    if (!r.is_active) continue
    existingKeys.add(patternKey(r.name ?? '', r.amount))
  }

  // Bucket transactions by pattern key.
  const buckets = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.is_deleted) continue
    if (tx.is_recurring) continue // already-flagged transactions opt out
    if (tx.direction !== 'debit') continue
    if (!tx.merchant) continue // unmerchanted noise (cash, manual entry without name)
    const key = patternKey(tx.merchant, tx.amount)
    if (existingKeys.has(key)) continue
    if (dismissedKeys?.has(key)) continue
    const list = buckets.get(key) ?? []
    list.push(tx)
    buckets.set(key, list)
  }

  const candidates: RecurringPatternCandidate[] = []
  for (const [key, txns] of buckets) {
    if (txns.length < MIN_OCCURRENCES) continue

    const sorted = [...txns].sort((a, b) =>
      a.transacted_at.localeCompare(b.transacted_at),
    )
    const earliest = new Date(sorted[0].transacted_at).getTime()
    const latest = new Date(sorted[sorted.length - 1].transacted_at).getTime()
    const spreadDays = (latest - earliest) / DAY_MS
    if (spreadDays < MIN_DAYS_SPREAD) continue

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].transacted_at).getTime()
      const cur = new Date(sorted[i].transacted_at).getTime()
      gaps.push((cur - prev) / DAY_MS)
    }
    const medGap = median(gaps)
    const anchor = sorted[sorted.length - 1] // newest

    candidates.push({
      key,
      merchant: anchor.merchant ?? '',
      amount: anchor.amount,
      currency_code: anchor.currency_code,
      occurrences: sorted.length,
      lastSeenAt: anchor.transacted_at,
      frequency: inferFrequency(medGap),
      templateTxnId: anchor.id,
      category_id: anchor.category_id,
      payment_method: anchor.payment_method,
      direction: 'debit',
    })
  }

  // Show the heaviest patterns first (largest amount × occurrences). The
  // banner only renders one at a time, so prioritization matters.
  candidates.sort((a, b) => b.amount * b.occurrences - a.amount * a.occurrences)
  return candidates
}
