import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import pt from './locales/pt.json'

export type Locale = 'en' | 'fr' | 'es' | 'pt'

const locales = { en, fr, es, pt }

export const SUPPORTED_LOCALES: Locale[] = ['en', 'fr', 'es', 'pt']

export function t(key: string, locale: Locale = 'en'): string {
  const strings = locales[locale] as Record<string, string>
  return strings[key] ?? locales['en'][key as keyof typeof en] ?? key
}

/**
 * Picks the first of the device's ordered language preferences this app
 * ships a translation for, falling back to `'en'`. Exists for the pre-auth
 * screens (mobile sign-in/sign-up), which have no `profiles.locale` yet to
 * read — before this, they hard-coded `'en'` regardless of device language
 * (audit 08-F48, fix-plan 4.2). Callers pass
 * `getLocales().map(l => l.languageCode)` (`expo-localization`); kept
 * platform-agnostic here by taking plain strings rather than importing an
 * RN-only package into `packages/shared`.
 */
export function resolveLocale(languageCodes: (string | null | undefined)[]): Locale {
  for (const code of languageCodes) {
    const match = SUPPORTED_LOCALES.find((supported) => supported === code)
    if (match) return match
  }
  return 'en'
}

export { en, fr, es, pt }
