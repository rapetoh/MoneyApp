import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { findDuplicateJsonKeys } from '../localeIntegrity'

const here = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(here, '..', 'locales')
const LOCALE_FILES = ['en.json', 'fr.json', 'es.json', 'pt.json']

describe('findDuplicateJsonKeys', () => {
  it('catches a key repeated in the same object', () => {
    const text = `{
      "a.one": "first",
      "a.two": "second",
      "a.one": "shadowed"
    }`
    const issues = findDuplicateJsonKeys(text)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.key).toBe('a.one')
    expect(issues[0]?.line).toBe(4)
  })

  it('scopes duplicates to their own object — same key in sibling objects is fine', () => {
    const text = `{
      "outer": { "label": "x" },
      "other": { "label": "y" }
    }`
    expect(findDuplicateJsonKeys(text)).toHaveLength(0)
  })

  it('is not confused by escaped quotes or colons inside string values', () => {
    const text = `{
      "quote.example": "she said \\"hi\\": literally",
      "colon.example": "ratio is 3:2"
    }`
    expect(findDuplicateJsonKeys(text)).toHaveLength(0)
  })

  it('handles arrays and nested objects without false positives', () => {
    const text = `{
      "list": ["a", "b", { "x": 1 }],
      "nested": { "x": 1, "y": { "x": 2 } }
    }`
    expect(findDuplicateJsonKeys(text)).toHaveLength(0)
  })

  it('finds a duplicate nested inside an object even when the outer object is clean', () => {
    const text = `{
      "clean": "ok",
      "nested": { "dup": 1, "other": 2, "dup": 3 }
    }`
    const issues = findDuplicateJsonKeys(text)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.key).toBe('dup')
    expect(issues[0]?.path).toBe('nested')
  })
})

describe('packages/shared/src/i18n/locales/*.json have no duplicate keys', () => {
  for (const file of LOCALE_FILES) {
    it(file, () => {
      const text = readFileSync(join(LOCALES_DIR, file), 'utf-8')
      // Fails loudly (not silently) on malformed JSON too — a broken
      // locale file is exactly the kind of thing this test exists to catch.
      expect(() => JSON.parse(text)).not.toThrow()
      const issues = findDuplicateJsonKeys(text)
      const summary = issues.map((i) => `  line ${i.line}: "${i.key}"${i.path ? ` (in ${i.path})` : ''}`)
      expect(issues, `duplicate keys in ${file}:\n${summary.join('\n')}`).toHaveLength(0)
    })
  }
})
