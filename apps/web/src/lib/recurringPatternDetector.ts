// Web mirror of apps/mobile/src/services/recurringPatternDetector.ts.
// Same heuristics, same return shape — kept in lock-step so the two surfaces
// surface the same candidates from the same data. If the mobile detector is
// updated, copy the change over here.
import type { Transaction, RecurringRule, RecurringFrequency } from '@voice-expense/shared'

interface CandidateInput {
  transactions: Transaction[]
  existingRules: RecurringRule[]
  dismissedKeys?: ReadonlySet<string>
}

export interface RecurringPatternCandidate {
  key: string
  merchant: string
  amount: number
  currency_code: string
  occurrences: number
  lastSeenAt: string
  frequency: RecurringFrequency
  templateTxnId: string
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
  const existingKeys = new Set<string>()
  for (const r of existingRules) {
    if (!r.is_active) continue
    existingKeys.add(patternKey(r.name ?? '', r.amount))
  }

  const buckets = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.is_deleted) continue
    if (tx.is_recurring) continue
    if (tx.direction !== 'debit') continue
    if (!tx.merchant) continue
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
    const anchor = sorted[sorted.length - 1]

    candidates.push({
      key: patternKey(anchor.merchant, anchor.amount),
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

  candidates.sort((a, b) => b.amount * b.occurrences - a.amount * a.occurrences)
  return candidates
}
