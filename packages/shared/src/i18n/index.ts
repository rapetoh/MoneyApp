import en from './locales/en.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import pt from './locales/pt.json'

export type Locale = 'en' | 'fr' | 'es' | 'pt'

const locales = { en, fr, es, pt }

export function t(key: string, locale: Locale = 'en'): string {
  const strings = locales[locale] as Record<string, string>
  return strings[key] ?? locales['en'][key as keyof typeof en] ?? key
}

export { en, fr, es, pt }
