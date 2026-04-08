import { t, type Locale } from '@voice-expense/shared'
import { getLocales } from 'expo-localization'
import { useState, useCallback } from 'react'

// Detect device locale, fallback to 'en'
function detectLocale(): Locale {
  const deviceLocale = getLocales()[0]?.languageCode ?? 'en'
  const supported: Locale[] = ['en', 'fr', 'es', 'pt']
  return supported.includes(deviceLocale as Locale) ? (deviceLocale as Locale) : 'en'
}

let _locale: Locale = detectLocale()

export function getLocale(): Locale {
  return _locale
}

export function setLocale(locale: Locale): void {
  _locale = locale
}

// Translate using current locale
export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(_locale)

  const changeLocale = useCallback((newLocale: Locale) => {
    _locale = newLocale
    setLocaleState(newLocale)
  }, [])

  const translate = useCallback(
    (key: string) => t(key, locale),
    [locale],
  )

  return { locale, t: translate, setLocale: changeLocale }
}

// Simple standalone translate for use outside components
export { t }
