import { useEffect, useCallback } from 'react'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'

/**
 * Parses an incoming deep-link URL for the iOS Shortcuts flow.
 * Expected format: voiceexpense://shortcut?amount=4.50&merchant=Starbucks&currency=USD&payment_method=digital_wallet
 * Returns route params suitable for passing to /(tabs)/record, or null if the URL is not a shortcut link.
 *
 * Fix-plan 3.4 / audit 07-F19, 02-F34, 08-F19: `expo-linking`'s `parse` is
 * built on `new URL(url)`. For `voiceexpense://shortcut?amount=1` the `//`
 * after the scheme introduces an authority, so the parser reads
 * `hostname === 'shortcut'` and `pathname === ''` → `path === null`.
 * Matching on `path` alone rejected every well-formed shortcut URL a real
 * iOS Shortcut ever emits. `hostname ?? path` accepts both that shape and
 * a hypothetical `voiceexpense:///shortcut?...` (no authority, real path).
 */
export function parseShortcutUrl(url: string): Record<string, string> | null {
  try {
    const { path, hostname, queryParams } = Linking.parse(url)
    if ((hostname ?? path) !== 'shortcut') return null
    const p = queryParams ?? {}
    const amount = parseFloat(String(p.amount ?? ''))
    if (isNaN(amount) || amount <= 0) return null
    return {
      shortcut_amount: String(amount),
      shortcut_merchant: String(p.merchant ?? ''),
      shortcut_currency: String(p.currency ?? ''),
      shortcut_payment_method: String(p.payment_method ?? 'digital_wallet'),
    }
  } catch {
    return null
  }
}

/**
 * Listens for incoming iOS Shortcut deep links (voiceexpense://shortcut?...) and
 * navigates to the Record screen with the pre-filled amount and merchant as route params.
 * Call this once inside the root layout so it's always active.
 */
export function useShortcutHandler() {
  const router = useRouter()

  const handleUrl = useCallback(
    (url: string) => {
      const params = parseShortcutUrl(url)
      if (!params) return
      router.push({ pathname: '/(tabs)/record', params })
    },
    [router],
  )

  useEffect(() => {
    // App launched from a cold start via the shortcut URL
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url)
    })

    // App already running (foreground or background) when shortcut fires
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => sub.remove()
  }, [handleUrl])
}
