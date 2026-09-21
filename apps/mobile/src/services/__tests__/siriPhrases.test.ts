/**
 * Siri matches an App Shortcut phrase literally, and the translations in
 * `<lang>.lproj/AppShortcuts.strings` are keyed by the *English* phrase
 * exactly as the Swift declares it. One stray comma between the two files
 * and that phrase silently falls back to English on every French, Spanish
 * and Portuguese phone, with nothing failing at build time.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PHRASES, LOCALES } = require('../../../native/ios/siri-phrases.js') as {
  PHRASES: Record<string, string[]>
  LOCALES: string[]
}

const swift = readFileSync(
  path.join(__dirname, '../../../native/ios/SiriLogExpense.swift'),
  'utf8',
)

describe('Siri phrases', () => {
  it('declares every English phrase the translations are keyed by', () => {
    for (const phrase of PHRASES.en) {
      const asSwift = phrase.replace('${applicationName}', '\\(.applicationName)')
      expect(swift, `missing from SiriLogExpense.swift: ${phrase}`).toContain(`"${asSwift}"`)
    }
  })

  it('translates every phrase in every language Murmur speaks', () => {
    for (const lang of LOCALES) {
      expect(PHRASES[lang], lang).toHaveLength(PHRASES.en.length)
      for (const phrase of PHRASES[lang]) {
        // Apple requires the app name inside every phrase; a phrase
        // without it is dropped at build time.
        expect(phrase, `${lang}: ${phrase}`).toContain('${applicationName}')
        expect(phrase.trim()).toBe(phrase)
      }
      expect(new Set(PHRASES[lang]).size, `${lang} has duplicates`).toBe(PHRASES[lang].length)
    }
  })
})
