// Pure helpers for the YYYY-MM URL state used by the Overview month picker.
// Lives outside the client `MonthPicker` component so server components
// (the Overview page) can import the parser without crossing the
// client/server boundary.

export function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Parse a `YYYY-MM` string. Falls back to the current month on bad input. */
export function parseMonthIso(iso: string | undefined): { year: number; month: number } {
  if (iso && /^\d{4}-\d{2}$/.test(iso)) {
    const [y, m] = iso.split('-').map(Number)
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 }
  }
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() }
}
