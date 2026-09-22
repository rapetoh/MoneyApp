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
  PHRASES: Record<string, Record<'expense' | 'income', string[]>>
  LOCALES: string[]
}
const KINDS = ['expense', 'income'] as const

const swift = readFileSync(
  path.join(__dirname, '../../../native/ios/SiriLogExpense.swift'),
  'utf8',
)

describe('Siri phrases', () => {
  it('declares every English phrase the translations are keyed by', () => {
    for (const kind of KINDS) {
      for (const phrase of PHRASES.en[kind]) {
        const asSwift = phrase.replace('${applicationName}', '\\(.applicationName)')
        expect(swift, `missing from SiriLogExpense.swift: ${phrase}`).toContain(`"${asSwift}"`)
      }
    }
  })

  it('offers income its own door, because capture is one flow', () => {
    // Build 65 shipped expense phrases only, so "log a source of income in
    // Murmur" got "I can't help you with that" on the owner's phone.
    expect(PHRASES.en.income.length).toBeGreaterThan(4)
    expect(swift).toContain('LogSpokenIncomeIntent')
  })

  it('translates every phrase in every language Murmur speaks', () => {
    for (const lang of LOCALES) {
      const all: string[] = []
      for (const kind of KINDS) {
        expect(PHRASES[lang][kind], `${lang}.${kind}`).toHaveLength(PHRASES.en[kind].length)
        for (const phrase of PHRASES[lang][kind]) {
          // Apple requires the app name inside every phrase; one without
          // it is dropped at build time.
          expect(phrase, `${lang}: ${phrase}`).toContain('${applicationName}')
          expect(phrase.trim()).toBe(phrase)
          all.push(phrase)
        }
      }
      expect(new Set(all).size, `${lang} has duplicates`).toBe(all.length)
    }
  })
})
