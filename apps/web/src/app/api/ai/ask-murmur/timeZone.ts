// Pure, testable pieces of `route.ts`'s request-boundary validation,
// split into their own module because Next.js's App Router type-checks
// that a `route.ts` file only exports HTTP method handlers (`POST`,
// `GET`, ...) and a small fixed set of route-config constants — any
// other named export (a plain helper function, for instance) fails the
// generated `.next/types/**/route.ts` constraint check. Colocated next
// to `route.ts` (not itself named `route.ts`) so it isn't treated as a
// route.

/** Validates an IANA zone string via `Intl` — anything it rejects
 *  (missing, empty, or a value `Intl.DateTimeFormat` doesn't recognize as
 *  a zone identifier) falls back to `'UTC'` rather than throwing partway
 *  through window math.
 *  fix-plan 2.10: the wire contract's `time_zone` field must be a real
 *  IANA zone before it reaches `ToolContext.tz` — `askMurmurTools.ts`
 *  re-validates defensively too, but this is the boundary that keeps a
 *  malformed client value from ever reaching it. */
export function resolveTimeZone(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return 'UTC'
  try {
    // eslint-disable-next-line no-new -- probing whether `raw` throws is the point.
    new Intl.DateTimeFormat('en-US', { timeZone: raw })
    return raw
  } catch {
    return 'UTC'
  }
}

/** Validates a full ISO 8601 instant, falling back to the real current
 *  instant when missing/unparseable — same defensive contract the old
 *  date-only `today` field's fallback provided. */
export function resolveNowUtc(raw: unknown): string {
  if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) return raw
  return new Date().toISOString()
}
