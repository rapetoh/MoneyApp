/**
 * Regression test for fix-plan item 1.8 (docs/audit-2026-08-08/01-mobile-
 * ui-and-layout.md F5): "no font is ever loaded; 305 fontFamily rules
 * silently fall back to the system font". Walks `typography.ts`'s
 * `fontFamily` map against the `FONT_MAP` registered in `app/_layout.tsx`
 * and the files actually present under `assets/fonts/`, so a future PR
 * that renames a face in one place and not the other fails CI instead of
 * silently falling back to San Francisco/Roboto on every device.
 *
 * This reads the two files as text rather than importing them: `typography
 * .ts` imports `Platform` from `react-native`, and `_layout.tsx`
 * `require()`s binary `.ttf` assets — neither survives a plain Node import
 * outside Metro's transform (see vitest.config.mts: this suite is scoped to
 * plain-TS logic for exactly that reason). A structural walk of the source
 * is also what "resolves to a bundled file or a documented system family"
 * (1.8's Done-when) actually asks for.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const themeDir = join(here, '..')
const mobileRoot = join(themeDir, '..', '..')
const fontsDir = join(mobileRoot, 'assets', 'fonts')

const typographySrc = readFileSync(join(themeDir, 'typography.ts'), 'utf8')
const layoutSrc = readFileSync(join(mobileRoot, 'app', '_layout.tsx'), 'utf8')
const filesOnDisk = new Set(readdirSync(fontsDir))

/** Every `key: 'Value'` pair inside `typography.ts`'s `fontFamily: { ... }`
 *  block. Non-string-literal values (the system serif) are recorded
 *  separately since they name no loadable face. */
function parseFontFamilyMap(src: string): { literal: Record<string, string>; system: string[] } {
  const blockMatch = src.match(/fontFamily:\s*{([\s\S]*?)\n\s*}/)
  if (!blockMatch) throw new Error('Could not locate `fontFamily: { ... }` block in typography.ts')
  const literal: Record<string, string> = {}
  const system: string[] = []
  for (const line of blockMatch[1].split('\n')) {
    const stringValue = line.match(/^\s*(\w+):\s*'([^']+)',?\s*(\/\/.*)?$/)
    if (stringValue) {
      literal[stringValue[1]] = stringValue[2]
      continue
    }
    const identifierValue = line.match(/^\s*(\w+):\s*(\w+),?\s*(\/\/.*)?$/)
    if (identifierValue) system.push(identifierValue[1])
  }
  return { literal, system }
}

/** Every `Key: require('...path.ttf')` pair inside `_layout.tsx`'s
 *  `FONT_MAP = { ... }` block, key -> basename of the required file. */
function parseFontMap(src: string): Record<string, string> {
  const blockMatch = src.match(/const FONT_MAP = {([\s\S]*?)\n}/)
  if (!blockMatch) throw new Error('Could not locate `const FONT_MAP = { ... }` block in _layout.tsx')
  const map: Record<string, string> = {}
  const entryPattern = /'?([\w-]+)'?:\s*require\('([^']+)'\)/g
  let match: RegExpExecArray | null
  while ((match = entryPattern.exec(blockMatch[1]))) {
    map[match[1]] = match[2].split('/').pop()!
  }
  return map
}

const { literal: declaredFaces, system: systemFaces } = parseFontFamilyMap(typographySrc)
const registeredFonts = parseFontMap(layoutSrc)

describe('Typography.fontFamily faces all resolve (F5)', () => {
  it('found a non-empty fontFamily map to check', () => {
    expect(Object.keys(declaredFaces).length).toBeGreaterThan(0)
  })

  it('found a non-empty FONT_MAP to check against', () => {
    expect(Object.keys(registeredFonts).length).toBeGreaterThan(0)
  })

  it.each(Object.entries(declaredFaces))(
    'Typography.fontFamily.%s ("%s") is registered in useFonts()',
    (_key, faceName) => {
      expect(registeredFonts).toHaveProperty(faceName)
    },
  )

  it.each(Object.entries(registeredFonts))(
    'the file registered under "%s" (%s) exists in assets/fonts/',
    (_faceName, filename) => {
      expect(filesOnDisk.has(filename)).toBe(true)
    },
  )

  it('every registered face is actually referenced by the type system (no orphans)', () => {
    const referenced = new Set(Object.values(declaredFaces))
    const orphaned = Object.keys(registeredFonts).filter((face) => !referenced.has(face))
    expect(orphaned).toEqual([])
  })

  it('the system-family entries (serif/serifBold) name no loadable face on purpose', () => {
    // These resolve to a Platform.select() result ('New York' on iOS,
    // 'serif' on Android/default) — a real device family, not a bundled
    // asset. Documented here so the next reader doesn't "fix" it by
    // adding a font file that doesn't exist upstream.
    expect(systemFaces).toEqual(expect.arrayContaining(['serif', 'serifBold']))
  })
})
