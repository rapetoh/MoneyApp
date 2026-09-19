/**
 * First-run setup: language, currency and speech-recognition language
 * derived from the device (first-run audit C1, Sep 19 2026).
 *
 * The server creates every profile with the column defaults ('en', 'USD',
 * voice 'en-US'); nothing used to correct them from the phone, so a French
 * speaker got an English app and an English speech recognizer, and a user
 * in London saw dollars. These helpers are the one place that turns what
 * the device reports (expo-localization on mobile, navigator on web) into
 * values the profile accepts. Pure functions, no platform imports.
 */
import type { Locale } from '../i18n'

/** Each language's own name, for pickers. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  pt: 'Português',
}

/** Currencies offered in the setup screen and in Settings, in display order. */
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY',
  'BRL', 'MXN', 'INR', 'ZAR',
  'XOF', 'XAF', 'NGN', 'GHS',
] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

/** The device's ISO 4217 code when Murmur supports it, else USD. */
export function resolveCurrency(deviceCurrency: string | null | undefined): SupportedCurrency {
  const code = (deviceCurrency ?? '').toUpperCase()
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code) ? (code as SupportedCurrency) : 'USD'
}

/** Default region per app language, used when the device region doesn't
 *  pair with the chosen language (e.g. an English phone switched to French). */
const DEFAULT_REGION: Record<Locale, string> = {
  en: 'US',
  fr: 'FR',
  es: 'ES',
  pt: 'BR',
}

/** Regions Apple's recognizer ships for each language (iOS 17+). A region
 *  outside this list falls back to the language's default region. */
const RECOGNIZER_REGIONS: Record<Locale, readonly string[]> = {
  en: ['US', 'GB', 'CA', 'AU', 'IE', 'IN', 'NZ', 'SG', 'ZA', 'PH'],
  fr: ['FR', 'CA', 'BE', 'CH'],
  es: ['ES', 'MX', 'US', 'AR', 'CL', 'CO', 'PE'],
  pt: ['BR', 'PT'],
}

/**
 * BCP-47 tag for the speech recognizer: the app language plus the device
 * region when the recognizer supports that pairing ("fr" + "CA" -> "fr-CA"),
 * else the language's default ("fr" + "SN" -> "fr-FR").
 */
export function voiceLanguageFor(locale: Locale, deviceRegion: string | null | undefined): string {
  const region = (deviceRegion ?? '').toUpperCase()
  const ok = RECOGNIZER_REGIONS[locale].includes(region)
  return `${locale}-${ok ? region : DEFAULT_REGION[locale]}`
}

/**
 * The recognizer language to actually use. `profiles.voice_language` is
 * NOT NULL DEFAULT 'en-US' and was never written by any client before this
 * fix, so a stored value whose language doesn't match the app language is
 * the untouched default, not a choice: derive it from the app language.
 */
export function effectiveVoiceLanguage(
  stored: string | null | undefined,
  locale: Locale,
  deviceRegion: string | null | undefined,
): string {
  const lang = (stored ?? '').split('-')[0]?.toLowerCase()
  if (stored && lang === locale) return stored
  return voiceLanguageFor(locale, deviceRegion)
}
