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

/**
 * Validates the shortcut query. Returns `null` when there is no positive
 * amount — the one field a Shortcut must carry — so the caller can fall
 * back to plain `/(tabs)` instead of presenting an empty result sheet.
 */
export function shortcutRouteParams(query: Query): ShortcutRouteParams | null {
  const amount = parseFloat(first(query.amount))
  if (isNaN(amount) || amount <= 0) return null
  return {
    shortcut_amount: String(amount),
    shortcut_merchant: first(query.merchant),
    shortcut_currency: first(query.currency),
    shortcut_payment_method: first(query.payment_method) || 'digital_wallet',
  }
}
