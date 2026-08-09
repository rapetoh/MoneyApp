// Pure helpers for the YYYY-MM URL state used by the Overview month picker.
// Lives outside the client `MonthPicker` component so server components
// (the Overview page) can import the parser without crossing the
// client/server boundary.
//
// fix-plan 1.3 — both functions here used to build a bare `new Date()` and
// read its *runtime-local* getters: UTC on the Vercel server, the
// browser's own zone on the client, two different answers for the same
// moment depending on which side rendered. They now delegate to
// `packages/shared/src/utils/period.ts`, which takes an IANA zone
// explicitly and has no default — see that module's docstring for why.
// `tz` is required here for the same reason: callers pass
// `profile.timezone`.

import { currentMonthIso as sharedCurrentMonthIso } from '@voice-expense/shared'

export function currentMonthIso(tz: string): string {
  return sharedCurrentMonthIso(tz)
}

/** Parse a `YYYY-MM` string into `{ year, month }` (`month` 0-based,
 *  matching `Date#getMonth()`'s convention — the shape every existing
 *  `LensProps.anchorMonth` consumer expects). Falls back to the current
 *  month in `tz` on missing/malformed input. */
export function parseMonthIso(iso: string | undefined, tz: string): { year: number; month: number } {
  if (iso && /^\d{4}-\d{2}$/.test(iso)) {
    const [y, m] = iso.split('-').map(Number)
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 }
  }
  const [y, m] = currentMonthIso(tz).split('-').map(Number)
  return { year: y, month: m - 1 }
}
