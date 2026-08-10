/**
 * Rounds to the nearest cent using half-**away-from-zero** — the same
 * rounding `Intl.NumberFormat`'s default `roundingMode` and
 * `Number.prototype.toFixed` both use (05-F32). `Math.round` alone is
 * NOT this: it rounds negative halves toward +Infinity
 * (`Math.round(-0.5) === -0`, not `-1`), which is exactly the kind of
 * platform-invisible one-cent divergence this audit went looking for.
 * Apply this at the boundary of every aggregation and every *derived*
 * figure (an average, a percentage, a `× 4.33` frequency multiplier) —
 * `summarize()` below already sums in integer cents internally, so
 * this is the backstop for arithmetic done on its output, not a
 * replacement for cents discipline.
 */
export function roundCents(amount: number): number {
  const sign = amount < 0 ? -1 : 1
  return (sign * Math.round(Math.abs(amount) * 100)) / 100
}

/**
 * The structural pieces of a formatted money value, for callers that
 * render the sign/symbol/digits as separate styled runs (e.g. a
 * smaller decimal, a colored sign) instead of one opaque string.
 * Built on `Intl.NumberFormat(...).formatToParts()` so symbol
 * placement and grouping follow the locale rather than a hand-rolled
 * table (07-F28, 07-F29) — it is correct for any ISO 4217 code Intl
 * knows about, not just the ten this app currently offers.
 */
export interface MoneyParts {
  /** `'-'` when the amount is negative, `''` otherwise. Never `'+'` —
   *  callers that want an explicit `+` (F30's `showPositiveSign`)
   *  prepend it themselves; this only ever answers "is it negative". */
  sign: '-' | ''
  /** The currency symbol/code as the locale would render it — `'$'`,
   *  `'€'`, `'CHF'`, `'XAF'`… */
  symbol: string
  /** True when the symbol renders before the digits (`$92`), false
   *  when it renders after (`92 €`). */
  symbolFirst: boolean
  /** Grouped integer digits, e.g. `'1,234'`. */
  integer: string
  /** The locale's decimal separator, e.g. `'.'` or `','`. Empty string
   *  when the currency has no fraction digits (e.g. JPY). */
  decimal: string
  /** Fraction digits with no separator, e.g. `'56'`. Empty string when
   *  the currency has no fraction digits. */
  fraction: string
}

export function formatMoneyParts(
  value: number,
  currencyCode: string,
  locale: string,
): MoneyParts {
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(Math.abs(value))

  let symbol = ''
  let integer = ''
  let decimal = ''
  let fraction = ''
  let symbolSeenBeforeDigits = false
  let sawDigit = false
  for (const part of parts) {
    if (part.type === 'currency') {
      symbol += part.value
      if (!sawDigit) symbolSeenBeforeDigits = true
    } else if (part.type === 'integer' || part.type === 'group') {
      integer += part.value
      sawDigit = true
    } else if (part.type === 'decimal') {
      decimal = part.value
    } else if (part.type === 'fraction') {
      fraction = part.value
    }
    // literal/space parts (e.g. the nbsp between symbol and digits) are
    // deliberately dropped — callers compose their own spacing.
  }

  return {
    sign: value < 0 ? '-' : '',
    symbol,
    symbolFirst: symbolSeenBeforeDigits,
    integer,
    decimal,
    fraction,
  }
}

/**
 * The one money formatter both platforms call. `locale` is
 * **required** — the old `formatCurrency` default of `'en'` is what
 * produced eleven wrong call sites across mobile and web (07-F30):
 * omitting the argument compiled cleanly and silently formatted every
 * non-English profile in English grouping. There is no safe default
 * for this parameter; callers must plumb it from `profile.locale`.
 *
 * `precision: 'compact'` (`$1.2K`) is for chart axes and other
 * space-constrained surfaces only — never a hero amount or a
 * transaction row, where the exact figure is the point.
 */
export function formatMoney(
  value: number,
  currencyCode: string,
  locale: string,
  options?: { precision?: 'exact' | 'compact' },
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: options?.precision === 'compact' ? 0 : 2,
    maximumFractionDigits: options?.precision === 'compact' ? 1 : 2,
    notation: options?.precision === 'compact' ? 'compact' : 'standard',
  }).format(value)
}

/**
 * @deprecated Use `formatMoney(value, currencyCode, locale)` instead —
 * this defaults `locale` to `'en'`, which is exactly the F30 defect
 * (see `formatMoney`'s doc comment). Kept only so the ~6 call sites
 * Stage 2 hasn't migrated yet keep compiling; do not add new callers.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale: string = 'en',
): string {
  return formatMoney(amount, currencyCode, locale)
}

/** Compact display symbol for a currency code — "$", "€", "₦" … Falls
 *  back to the code itself (plus a space) for currencies without a
 *  well-known single glyph. Every amount-entry surface uses this so a
 *  EUR user sees "€" everywhere, never a bare "EUR" or a wrong "$"
 *  (MOBILE_REVIEW §1.6 / CROSS §6.3). */
export function currencySymbolFor(code: string): string {
  switch (code) {
    case 'USD':
    case 'CAD':
    case 'AUD':
      return '$'
    case 'EUR':
      return '€'
    case 'GBP':
      return '£'
    case 'JPY':
      return '¥'
    case 'CHF':
      return 'CHF '
    case 'NGN':
      return '₦'
    case 'GHS':
      return '₵'
    case 'XAF':
      return 'CFA '
    default:
      return code + ' '
  }
}

/**
 * Quick-adjust chip magnitudes for the amount-correction UI (fix-plan
 * 2.6 / audit 01-F19) — keyed by currency because a fixed `±1` step is a
 * different-sized nudge in every currency. `±1 USD` corrects a coffee-run
 * typo; `±1 JPY` or `±1 XAF` is smaller than the currency's own rounding
 * noise and cannot correct anything a user would actually mis-hear. These
 * are static, deliberately-round approximations of "a small, medium and
 * large real-world correction" in each currency, not a live FX
 * conversion of the USD defaults — they don't need to track exchange
 * rates precisely, only stay in the right order of magnitude. Add an
 * entry here (not a call-site literal) when a new currency joins
 * `settings.tsx`'s `CURRENCIES` list.
 */
const ADJUST_DELTA_MAGNITUDES: Record<string, [number, number, number, number]> = {
  JPY: [-100, 100, 500, 1000],
  XAF: [-500, 500, 2500, 5000],
  NGN: [-500, 500, 2500, 5000],
  GHS: [-5, 5, 25, 50],
}

/** Default step for currencies not listed in `ADJUST_DELTA_MAGNITUDES`
 *  (USD, EUR, GBP, CAD, CHF, AUD …) — matches the app's original
 *  hard-coded `[-1, 1, 5, 10]`. */
const DEFAULT_ADJUST_DELTAS: [number, number, number, number] = [-1, 1, 5, 10]

export function amountAdjustDeltasFor(currencyCode: string): [number, number, number, number] {
  return ADJUST_DELTA_MAGNITUDES[currencyCode] ?? DEFAULT_ADJUST_DELTAS
}

// `merchantColor`, merchant-logo domain guessing and category-tint
// derivation moved to `./color.ts` (fix-plan 4.4) — a money-formatting
// file is the wrong home for color math, and that module is now the one
// place both apps import all three from.
