/**
 * Recurring-pattern detector — fix-plan item 1.5, the "one pattern
 * detector" half. Merges `apps/mobile/src/services/
 * recurringPatternDetector.ts` and `apps/web/src/lib/
 * recurringPatternDetector.ts`, which were a hand-maintained copy-paste
 * pair (the web file's own header: *"If the mobile detector is updated,
 * copy the change over here"* — an admission this class of drift was
 * expected). Both call sites now import this instead (07-F22's
 * "same defect elsewhere" note).
 *
 * Per DESIGN.md §"Retention mechanics": "Recurring detection kicks in
 * after 2–3 occurrences of a merchant + amount pattern." This is the
 * pure logic side — it scans transactions and returns candidate
 * subscriptions/bills; the caller renders the "new pattern detected"
 * banner and turns an accepted candidate into a real rule.
 *
 * Heuristics (unchanged from the two originals except cadence
 * inference, below):
 *  - Group by (merchant lowercased, amount rounded to nearest cent). A
 *    1-cent FX wobble between months would otherwise split a single
 *    pattern into two phantom patterns.
 *  - Require >= 2 occurrences (the design doc's lower bound) spread
 *    over >= 21 days (long enough that two same-day transactions of the
 *    same amount don't trigger a false "you have a subscription").
 *  - Skip transactions already flagged `is_recurring`, already covered
 *    by an active rule, explicitly dismissed, or without a merchant.
 *  - Skip credits (income detection is its own thing).
 *
 * Cadence inference — **changed**. The two originals bucketed the
 * median inter-occurrence gap into six frequencies with the top bucket
 * open-ended (`>95 days -> yearly`), so two charges six months apart
 * (~182 days) were reported as "likely yearly" — a real cadence
 * (semiannual) this app has no frequency for, misreported as a
 * different one. `inferFrequency` now uses a tolerance band around each
 * canonical cadence (7/14/~30/~91/~365 days) and returns `null` — the
 * bucket is dropped, not mislabeled — for a gap that doesn't land
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
const MIN_DAYS_SPREAD = 21
const DAY_MS = 24 * 60 * 60 * 1000

/** `[min, max]` days, inclusive, that confidently reads as this
 *  cadence. Gaps between bands (e.g. 111–334 days, which swallows a
 *  ~182-day semiannual gap) return `null` from `inferFrequency` rather
 *  than snapping to the nearest neighbour. */
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
  existingRules,
  dismissedKeys,
}: CandidateInput): RecurringPatternCandidate[] {
  // Quick-lookup of existing rule keys so an already-accepted pattern
  // isn't re-suggested.
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
  for (const [, txns] of buckets) {
    if (txns.length < MIN_OCCURRENCES) continue

    const sorted = [...txns].sort((a, b) => a.transacted_at.localeCompare(b.transacted_at))
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
    const frequency = inferFrequency(median(gaps))
    // No confident cadence — not a recurring signal this app can name
    // correctly (module docstring). Drop the candidate rather than
    // mislabel it.
    if (!frequency) continue

    const anchor = sorted[sorted.length - 1] // newest

    candidates.push({
      key: patternKey(anchor.merchant, anchor.amount),
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

  // Heaviest patterns first (largest amount x occurrences) — the banner
  // renders one at a time, so prioritization matters.
  candidates.sort((a, b) => b.amount * b.occurrences - a.amount * a.occurrences)
  return candidates
}
