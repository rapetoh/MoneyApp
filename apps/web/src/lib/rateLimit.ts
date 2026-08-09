// Per-user rate limiting for the AI routes — fix-plan item 1.7, part 4
// (audit 02-F26: "No rate limiting on either AI route; transcript length
// unbounded; image size checked after full-body parse").
//
// In-memory, keyed on the already-validated `userId` (never on an
// unauthenticated IP — `validateToken` runs first in every caller so a
// bucket can never be primed by a request nobody paid an auth cost for).
// This is a single-process fixed-window counter, not a distributed one:
// correct for the one long-lived Vercel Node.js function this project
// actually runs as (`export const runtime` is unset, so these routes are
// not Edge functions with per-request cold isolates), and explicitly not
// a promise of exactness across a multi-instance deployment — the goal is
// "a compromised or buggy client can't run up an unbounded OpenAI bill",
// not billing-grade precision.

interface Bucket {
  count: number
  windowStartMs: number
}

const buckets = new Map<string, Bucket>()

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets, for a `Retry-After` header. */
  retryAfterSeconds: number
}

/**
 * `key` should already namespace the route, e.g. `parse:${userId}` vs
 * `scan:${userId}` vs `ask:${userId}` — one bucket per (route, user) pair.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key)
  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now })
    return { allowed: true, retryAfterSeconds: 0 }
  }
  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil((existing.windowStartMs + windowMs - now) / 1000)
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) }
  }
  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test-only: drops every tracked bucket so test files don't leak state
 *  into each other via this module's shared `Map`. */
export function __resetRateLimitsForTests(): void {
  buckets.clear()
}
