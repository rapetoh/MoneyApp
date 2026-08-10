/**
 * Recurring-pattern detector — fix-plan item 1.5, the "one pattern
 * detector" half, extended by item 2.3's "while consolidating" list.
 * Merges `apps/mobile/src/services/recurringPatternDetector.ts` and
 * `apps/web/src/lib/recurringPatternDetector.ts`, which were a
 * hand-maintained copy-paste pair (the web file's own header: *"If the
 * mobile detector is updated, copy the change over here"* — an
 * admission this class of drift was expected). Both call sites now
 * import this instead (07-F22's "same defect elsewhere" note).
 *
 * Per DESIGN.md §"Retention mechanics": "Recurring detection kicks in
 * after 2–3 occurrences of a merchant + amount pattern." This is the
 * pure logic side — it scans transactions and returns candidate
 * subscriptions/bills; the caller renders the "new pattern detected"
 * banner and turns an accepted candidate into a real rule.
 *
 * Heuristics:
 *  - Group by normalised merchant only, then sub-cluster chronologically
 *    by a **relative** amount tolerance (`AMOUNT_TOLERANCE`) rather than
 *    exact cents — exact-cent bucketing excluded every variable bill,
 *    including a utility that is never the same amount twice running.
 *    Netflix at $9.99 then $10.99 (a price change) is one cluster, not
 *    a 1-occurrence phantom plus a 2-occurrence one.
 *  - Require >= 2 occurrences (>= 3 for a cadence slower than monthly —
 *    quarterly/yearly — where two data points is barely more than a
 *    coincidence) spread over >= 21 days, with every inter-occurrence
 *    gap within +/-25% of the cluster's median gap — a genuine monthly
 *    bill's ~28-31 day wobble passes; three transactions that happen to
 *    land 10/60/25 days apart do not, even if the median lands in a
 *    band.
 *  - Skip transactions already linked to a rule (`recurring_rule_id`,
 *    active or paused — suppression by rule identity, not by
 *    `(name, amount)`: a renamed rule's transactions stay linked and
 *    excluded, an unnamed rule's do too, and pausing a rule does not
 *    resurface its history as a "new" pattern — 2.3's fix for all
 *    three), explicitly dismissed, or without a merchant. A flat
 *    `is_recurring` flag is *not* checked (2.2) — `existingKeys`-by-
 *    identity already expresses the real condition, and the flag alone
 *    (set client-side, before the server has linked a rule) does not
 *    imply one exists.
 *  - Skip credits (income detection is its own thing).
 *
 * Cadence inference. The two originals this module replaced bucketed
 * the median inter-occurrence gap into six frequencies with the top
 * bucket open-ended (`>95 days -> yearly`), so two charges six months
 * apart (~182 days) were reported as "likely yearly" — a real cadence
 * (semiannual) this app has no frequency for, misreported as a
 * different one. `inferFrequency` uses a tolerance band around each
 * canonical cadence (7/14/~30/~91/~365, capped ~400) and returns `null`
 * — the bucket is dropped, not mislabeled — for a gap that doesn't land
 * confidently in any of them. A recurring signal this app cannot name
 * correctly is not a recurring signal this app should assert.
 */
import type { Transaction } from '../types/transaction'
import type { RecurringRule, RecurringFrequency } from '../types/recurring'

interface CandidateInput {
  transactions: Transaction[]
  existingRules: RecurringRule[]
  /** Keys of patterns the user has explicitly dismissed — the detector
   *  skips these so the banner doesn't resurface them. */
  dismissedKeys?: ReadonlySet<string>
}

export interface RecurringPatternCandidate {
  /** Stable, hashable key (merchant lower + cents). Use to record
   *  dismissal and as a list `key`. */
  key: string
  merchant: string
  amount: number
  currency_code: string
  occurrences: number
  /** ISO instant of the most recent occurrence — "Last seen Apr 12". */
  lastSeenAt: string
  /** Best guess at the natural cadence based on inter-occurrence gaps. */
  frequency: RecurringFrequency
  /** The most-recent transaction anchoring the candidate; passed as
   *  `template_txn_id` when accepted. */
  templateTxnId: string
  category_id: string | null
  payment_method: string | null
  direction: 'debit' | 'credit'
}

const MIN_OCCURRENCES = 2
/** Cadences at or slower than this require >= 3 occurrences, not 2 —
 *  two data points 90+ days apart barely distinguishes a real quarterly
 *  bill from a coincidence. */
const SLOWER_THAN_MONTHLY: ReadonlySet<RecurringFrequency> = new Set(['quarterly', 'yearly'])
const MIN_OCCURRENCES_SLOW = 3
const MIN_DAYS_SPREAD = 21
/** Relative amount tolerance for clustering a merchant's transactions
 *  into one variable-amount pattern (e.g. a utility bill) instead of
 *  one phantom pattern per distinct amount. Each new transaction is
 *  compared against the cluster's running mean, not its first member,
 *  so a bill that drifts gradually ($9.99 -> $10.99 -> $11.99) stays
 *  one cluster even though the first and last are >20% apart. */
const AMOUNT_TOLERANCE = 0.2
/** An individual inter-occurrence gap may not deviate from the
 *  cluster's median gap by more than this fraction — a genuine
 *  monthly bill's 28-31 day wobble passes; three timestamps that
 *  happen to average into a band by coincidence do not. */
const GAP_VARIANCE_TOLERANCE = 0.25
const DAY_MS = 24 * 60 * 60 * 1000

/** `[min, max]` days, inclusive, that confidently reads as this
 *  cadence. Gaps between bands (e.g. 111–334 days, which swallows a
 *  ~182-day semiannual gap) return `null` from `inferFrequency` rather
 *  than snapping to the nearest neighbour. Yearly's 395-day ceiling is
 *  the "cap the yearly bucket at ~400 days" requirement (2.3): two
 *  charges 400 days apart infer no cadence at all. */
const CADENCE_BANDS: ReadonlyArray<{ freq: RecurringFrequency; min: number; max: number }> = [
  { freq: 'daily', min: 0.5, max: 3 },
  { freq: 'weekly', min: 4, max: 10 },
  { freq: 'biweekly', min: 11, max: 20 },
  { freq: 'monthly', min: 21, max: 45 },
  { freq: 'quarterly', min: 75, max: 110 },
  { freq: 'yearly', min: 335, max: 395 },
]

function patternKey(merchant: string | null, amount: number): string {
  const cents = Math.round(amount * 100)
  const m = (merchant ?? '').toLowerCase().trim()
  return `${m}|${cents}`
}

function normalizedMerchant(merchant: string | null): string {
  return (merchant ?? '').toLowerCase().trim()
}

/**
 * Splits one merchant's chronologically-sorted transactions into
 * amount-tolerant clusters (module docstring's "relative amount
 * tolerance" heuristic). A transaction joins the open cluster when it
 * is within `AMOUNT_TOLERANCE` of that cluster's running mean;
 * otherwise it closes the current cluster and opens a new one.
 */
function clusterByAmount(sorted: Transaction[]): Transaction[][] {
  const clusters: Transaction[][] = []
  let current: Transaction[] = []
  let meanCents = 0

  for (const tx of sorted) {
    const cents = Math.round(tx.amount * 100)
    if (current.length === 0) {
      current = [tx]
      meanCents = cents
      continue
    }
    const relDiff = Math.abs(cents - meanCents) / meanCents
    if (relDiff <= AMOUNT_TOLERANCE) {
      current.push(tx)
      meanCents = current.reduce((s, t) => s + Math.round(t.amount * 100), 0) / current.length
    } else {
      clusters.push(current)
      current = [tx]
      meanCents = cents
    }
  }
  if (current.length > 0) clusters.push(current)
  return clusters
}

/** Returns `null` — not a fallback frequency — when `medianGapDays`
 *  doesn't land confidently in any canonical cadence band. See the
 *  module docstring: this is what stops a ~182-day gap between two
 *  charges from being asserted as "likely yearly". */
function inferFrequency(medianGapDays: number): RecurringFrequency | null {
  for (const band of CADENCE_BANDS) {
    if (medianGapDays >= band.min && medianGapDays <= band.max) return band.freq
  }
  return null
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const m = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m]
}

export function detectRecurringPatterns({
  transactions,
  dismissedKeys,
}: CandidateInput): RecurringPatternCandidate[] {
  // Suppression is by rule *identity*, not by matching `(name, amount)`
  // against the caller's active rules (2.3): a transaction the trigger
  // (migration 013) or a previous accept has linked to a rule —
  // active *or* paused — carries `recurring_rule_id`, and that alone is
  // the real "already covered" condition. Matching on `existingRules`
  // by name/amount is what let a rename re-suggest, an unnamed rule
  // suppress nothing, and pausing a rule instantly re-surface its own
  // history as "new" — `existingRules` (still accepted below, for API
  // stability with both call sites) is no longer consulted for this.

  // Group by normalised merchant, then sub-cluster each merchant's
  // chronological transactions by relative amount tolerance (module
  // docstring) — replaces exact-cents bucketing, which excluded every
  // variable bill.
  const byMerchant = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.is_deleted) continue
    if (tx.recurring_rule_id != null) continue // already linked — see above
    if (tx.direction !== 'debit') continue
    if (!tx.merchant) continue // unmerchanted noise (cash, manual entry without name)
    const m = normalizedMerchant(tx.merchant)
    const list = byMerchant.get(m) ?? []
    list.push(tx)
    byMerchant.set(m, list)
  }

  const candidates: RecurringPatternCandidate[] = []
  for (const [, merchantTxns] of byMerchant) {
    const sortedMerchant = [...merchantTxns].sort((a, b) =>
      a.transacted_at.localeCompare(b.transacted_at),
    )
    for (const sorted of clusterByAmount(sortedMerchant)) {
      const anchor = sorted[sorted.length - 1] // newest in this cluster
      const key = patternKey(anchor.merchant, anchor.amount)
      if (dismissedKeys?.has(key)) continue

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
      const medianGap = median(gaps)
      // Every individual gap must stay within +/-25% of the cluster's
      // median gap — a genuine cadence's natural wobble (28-31 days for
      // "monthly") passes; a cluster whose gaps only *average* into a
      // band by coincidence does not.
      const gapVarianceOk = gaps.every(
        (g) => Math.abs(g - medianGap) <= medianGap * GAP_VARIANCE_TOLERANCE,
      )
      if (!gapVarianceOk) continue

      const frequency = inferFrequency(medianGap)
      // No confident cadence — not a recurring signal this app can name
      // correctly (module docstring). Drop the candidate rather than
      // mislabel it.
      if (!frequency) continue

      const minOccurrences = SLOWER_THAN_MONTHLY.has(frequency)
        ? MIN_OCCURRENCES_SLOW
        : MIN_OCCURRENCES
      if (sorted.length < minOccurrences) continue

      candidates.push({
        key,
        merchant: anchor.merchant ?? '',
        amount: anchor.amount,
        currency_code: anchor.currency_code,
        occurrences: sorted.length,
        lastSeenAt: anchor.transacted_at,
        frequency,
        templateTxnId: anchor.id,
        category_id: anchor.category_id,
        payment_method: anchor.payment_method,
        direction: 'debit',
      })
    }
  }

  // Heaviest patterns first (largest amount x occurrences) — the banner
  // renders one at a time, so prioritization matters.
  candidates.sort((a, b) => b.amount * b.occurrences - a.amount * a.occurrences)
  return candidates
}
