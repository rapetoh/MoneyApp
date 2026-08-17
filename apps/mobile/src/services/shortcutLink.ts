/**
 * iOS Shortcuts deep link — `voiceexpense://shortcut?amount=4.50&merchant=Starbucks&currency=USD&payment_method=digital_wallet`.
 *
 * Expo Router resolves that URL to the `app/shortcut.tsx` route (host and
 * path fold together in its URL-to-route resolver, so `//shortcut` and
 * `///shortcut` both land there). This module only validates the query
 * that route receives and shapes it into the `shortcut_*` params the
 * `/(tabs)/record` bridge has always consumed — the bridge, the typed
 * currency / payment-method validation and `presentParsed(…, 'shortcut')`
 * are unchanged.
 *
 * History: until Aug 16 2026 this lived in `useShortcutHandler`, a
 * root-layout hook that parsed `Linking.getInitialURL()` / `url` events
 * itself and pushed the bridge. Two defects: (1) a *cold* start via the
 * link never reached that hook — with no `shortcut` route, Expo Router
 * rendered its internal not-found screen *beside* the root layout, so the
 * layout (splash hide, auth gate, the hook) never mounted and the app sat
 * on the launch screen forever; (2) on a warm start Expo Router's own
 * linking and the hook would both act on the same URL once a route
 * existed. A real route fixes both; the hook is gone.
 */

/** Plain record (not an interface) so it satisfies Expo Router's typed
 *  `Href` params, which need a string index signature. */
export type ShortcutRouteParams = Record<
  'shortcut_amount' | 'shortcut_merchant' | 'shortcut_currency' | 'shortcut_payment_method',
  string
>

type Query = Record<string, string | string[] | undefined>

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

/** ISO code for the currency symbol Wallet may prefix/suffix the amount
 *  with — used only when the Shortcut did not pass `currency` explicitly. */
const SYMBOL_CURRENCY: Array<[RegExp, string]> = [
  [/€/, 'EUR'],
  [/£/, 'GBP'],
  [/¥/, 'JPY'],
  [/₹/, 'INR'],
  [/CA\$|C\$/, 'CAD'],
  [/\$/, 'USD'],
]

/**
 * Parses the amount a Wallet transaction actually hands a Shortcut. Apple's
 * "Amount" field is a *formatted currency string* — `$2.11`, `€2,11`,
 * `2,11 €`, `1.234,56 €`, `CHF 12.50`, `1,234.56` — not a bare number
 * (verified on the owner's iPhone, Aug 17 2026: `$2.11` reached the app and
 * `parseFloat` returned NaN, so the link silently fell back to Today).
 * Handles symbols, letters, spaces, thousands separators and comma
 * decimals. A negative amount (a refund — Wallet renders it with a leading
 * minus) returns null: the Shortcut path only logs spending, and silently
 * booking a refund as an expense would be worse than not booking it.
 * Returns null when no usable positive number is present.
 */
export function parseShortcutAmount(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (/^[\s(]*[-−–]/.test(s) || /^\(.*\)$/.test(s)) return null
  // Keep digits and separators only.
  let digits = s.replace(/[^0-9.,]/g, '')
  if (!digits) return null
  const lastDot = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the later one is the decimal separator.
    if (lastComma > lastDot) digits = digits.replace(/\./g, '').replace(',', '.')
    else digits = digits.replace(/,/g, '')
  } else if (lastComma !== -1) {
    // Only commas: decimal if exactly one comma followed by 1–2 digits
    // ("2,11", "0,5"); otherwise thousands ("1,234", "12,345,678").
    const after = digits.length - lastComma - 1
    const single = digits.indexOf(',') === lastComma
    digits =
      single && after >= 1 && after <= 2 ? digits.replace(',', '.') : digits.replace(/,/g, '')
  } else if (lastDot !== -1) {
    // Only dots: more than one dot means thousands separators ("1.234.567").
    if (digits.indexOf('.') !== lastDot) digits = digits.replace(/\./g, '')
  }
  const n = parseFloat(digits)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

/** Currency the Shortcut passed, else the one implied by a symbol in the
 *  amount string, else ''. */
export function inferShortcutCurrency(rawAmount: string, explicit: string): string {
  if (explicit) return explicit
  for (const [re, code] of SYMBOL_CURRENCY) if (re.test(rawAmount)) return code
  return ''
}

/**
 * Validates the shortcut query. Returns `null` when there is no positive
 * amount — the one field a Shortcut must carry — so the caller can fall
 * back to plain `/(tabs)` instead of presenting an empty result sheet.
 */
export function shortcutRouteParams(query: Query): ShortcutRouteParams | null {
  const rawAmount = first(query.amount)
  const amount = parseShortcutAmount(rawAmount)
  if (amount == null) return null
  return {
    shortcut_amount: String(amount),
    shortcut_merchant: first(query.merchant),
    shortcut_currency: inferShortcutCurrency(rawAmount, first(query.currency)),
    shortcut_payment_method: first(query.payment_method) || 'digital_wallet',
  }
}
