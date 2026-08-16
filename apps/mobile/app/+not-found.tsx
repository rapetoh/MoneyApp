import { Redirect } from 'expo-router'

/**
 * Any URL that matches no route — a stale link, a typo'd scheme path, an
 * old deep link from a retired screen — lands here, *inside* the root
 * layout, and is sent to Today (the auth gate in app/_layout.tsx still
 * routes an unauthenticated user to sign-in from there).
 *
 * This file must exist. Without it Expo Router renders its own not-found
 * screen as a sibling of the root layout: the layout never mounts, the
 * launch screen is never dismissed, and a cold start via an unknown URL
 * strands the user on the logo (found Aug 16 2026 with the Shortcut link
 * before app/shortcut.tsx existed). No unknown URL may ever do that again.
 */
export default function NotFound() {
  return <Redirect href="/(tabs)" />
}
