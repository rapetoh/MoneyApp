import { Redirect, useLocalSearchParams } from 'expo-router'
import { shortcutRouteParams } from '../src/services/shortcutLink'

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
  if (!params) return <Redirect href="/(tabs)" />
  return <Redirect href={{ pathname: '/(tabs)/record', params }} />
}
