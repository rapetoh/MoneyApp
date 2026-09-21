import { File, Paths } from 'expo-file-system'
import type { Locale } from '@voice-expense/shared'

/**
 * The three profile fields a background capture cannot do without,
 * written to disk so they survive a cold start (Sep 20, 2026).
 *
 * Siri and Apple Pay both run with the app suspended or not running at
 * all. The profile cache is process-lifetime memory
 * (services/queryCache.ts), so on a background launch it is empty and the
 * fetch needs the network: until Sep 20 both capture paths simply fell
 * back to USD, English and UTC. For anyone outside the dollar zone that
 * wrote the wrong currency on exactly the entries the feature exists for,
 * and it happened silently.
 *
 * So the drain remembers the profile whenever it does have one, and reads
 * it back when it does not. A file, not SecureStore: none of this is
 * secret, and it sits beside the capture queue it serves.
 */
export interface CapturePrefs {
  currency: string
  locale: Locale
  timezone: string
}

const FILE = 'capture-prefs.json'

function prefsFile(): File {
  return new File(Paths.document, FILE)
}

/** Persist the profile's capture-relevant fields. Cheap and idempotent:
 *  it writes only when something actually changed. */
export function rememberCapturePrefs(next: CapturePrefs): void {
  if (!next.currency || !next.locale) return
  const current = readCapturePrefs()
  if (
    current &&
    current.currency === next.currency &&
    current.locale === next.locale &&
    current.timezone === next.timezone
  ) {
    return
  }
  try {
    prefsFile().write(JSON.stringify(next))
  } catch {
    // A capture must never fail because a preference could not be cached.
  }
}

/** What the last signed-in profile said, or null on a fresh install. */
export function readCapturePrefs(): CapturePrefs | null {
  try {
    const f = prefsFile()
    if (!f.exists) return null
    const raw = JSON.parse(f.textSync()) as Partial<CapturePrefs>
    if (typeof raw.currency !== 'string' || !raw.currency) return null
    return {
      currency: raw.currency,
      locale: (typeof raw.locale === 'string' ? raw.locale : 'en') as Locale,
      timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : 'UTC',
    }
  } catch {
    return null
  }
}

/** Forget them on sign-out: the next account's captures must not inherit
 *  the last one's currency. */
export function clearCapturePrefs(): void {
  try {
    const f = prefsFile()
    if (f.exists) f.delete()
  } catch {
    /* noop */
  }
}
