/**
 * Pure error-classification and backoff policy for the sync outbox.
 * Dependency-free (no supabase-js, no React Native) so it is trivially
 * unit-tested and shared between the drain loop and its tests.
 *
 * Fix-plan 1.6, point 2 ("Error classification and isolation") and
 * point 3 ("A retry scheduler").
 */

export type ErrorClass = 'recurring_dedup' | 'permanent' | 'transient'

export interface ClassifiableError {
  code?: string | null
  message?: string | null
}

// Postgres SQLSTATE class 23 (integrity constraint violation — NOT NULL,
// CHECK, UNIQUE, FK) and class 42 (syntax error or access rule violation,
// e.g. a column the server doesn't recognise) can never succeed by
// retrying the identical payload. Dead-letter them immediately instead of
// burning the backoff schedule on something that fails the same way in
// fifteen minutes — this is what makes a 23514 (CHECK violation) or a
// bogus column name a permanent failure rather than a stuck retry loop.
const PERMANENT_CODE = /^(23|42)/

/**
 * The one carve-out inside the permanent class: a 23505 (unique_violation)
 * on `idx_txn_recurring_dedup` means another writer (the server cron, or
 * this device on a prior launch) already produced this exact recurring
 * occurrence — a resolved conflict, not a failure. Narrowed to the
 * constraint name, not the bare SQLSTATE: any *other* unique violation
 * (a real bug, a genuine collision) is a hard failure that must dead-letter
 * rather than silently soft-delete the user's row.
 */
export function isRecurringDedupConflict(error: ClassifiableError | null | undefined): boolean {
  if (!error) return false
  if (error.code !== '23505') return false
  return Boolean(error.message?.includes('idx_txn_recurring_dedup'))
}

/**
 * Classifies a failed push so the drain loop knows whether to dead-letter
 * the entry immediately or schedule a backoff retry. Errors with no
 * Postgres SQLSTATE (network failures, 5xx, 401) and anything this
 * function doesn't recognise default to `transient` — a false "permanent"
 * verdict dead-letters a row that would have synced fine on the next
 * attempt, which is worse than one more bounded retry.
 */
export function classifyError(error: ClassifiableError | null | undefined): ErrorClass {
  if (!error) return 'transient'
  if (isRecurringDedupConflict(error)) return 'recurring_dedup'
  if (error.code && PERMANENT_CODE.test(error.code)) return 'permanent'
  return 'transient'
}

const BASE_DELAY_MS = 30_000 // 30s
const MAX_DELAY_MS = 15 * 60_000 // 15min

/**
 * `min(30s * 2^n, 15min)` plus up to 20% jitter, so a fleet of devices
 * that all lost the network at the same moment doesn't reconnect and
 * retry in lockstep. `random` is injectable for deterministic tests.
 */
export function computeBackoffMs(retryCount: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, retryCount)
  const base = Math.min(BASE_DELAY_MS * 2 ** exponent, MAX_DELAY_MS)
  const jitter = base * 0.2 * random()
  return Math.round(base + jitter)
}
