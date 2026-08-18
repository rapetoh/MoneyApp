import { useEffect } from 'react'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { shortcutRouteParams } from '../src/services/shortcutLink'
import { enqueueWalletCapture } from '../src/services/walletCapture'

/**
 * `voiceexpense://shortcut?amount=…&merchant=…` — the iOS Shortcuts entry
 * point (Apple Pay automation, see docs/PLAN.md "Shortcuts").
 *
 * This route exists so the link resolves *inside* the root layout: the
 * layout mounts (launch screen lifts, auth gate runs), then this screen
 * hands the validated params to the `/(tabs)/record` bridge, which
 * presents the shared result sheet and settles on Today. Without a route
 * file here, Expo Router sent a cold start to its internal not-found
 * screen beside the root layout and the app never left the launch screen
 * (Aug 16 2026, see src/services/shortcutLink.ts).
 *
 * Renders nothing — the root Stack shows it with `animation: 'none'`.
 */
export default function ShortcutRoute() {
  const query = useLocalSearchParams<{
    amount?: string
    merchant?: string
    currency?: string
    payment_method?: string
  }>()
  const params = shortcutRouteParams(query)
  // Aug 17 2026: no confirm sheet — the amount and merchant come from the
  // card network. Enqueue and let WalletCaptureDrain save it silently with
  // an undo toast, exactly like the background App Intent path; then land
  // on Today. (`params` is validated: a refund / empty amount is dropped.)
  const key = params
    ? `${params.shortcut_amount}|${params.shortcut_merchant}|${query.currency ?? ''}`
    : ''
  useEffect(() => {
    if (!params) return
    enqueueWalletCapture({
      amount: params.shortcut_amount,
      merchant: params.shortcut_merchant,
      currency: params.shortcut_currency,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return <Redirect href="/(tabs)" />
}
