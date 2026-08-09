/**
 * Dev/test-only JSON tooling for packages/shared/src/i18n/locales/*.json —
 * fix-plan item 1.1 ("a duplicate-key parser for
 * packages/shared/src/i18n/locales/*.json").
 *
 * `JSON.parse` silently keeps the LAST occurrence of a duplicate key and
 * discards the first with no warning, which is exactly how a copy-pasted
 * translation block goes stale forever without anyone noticing — the key
 * still resolves, just to the wrong (or an orphaned) value. Node has no
 * built-in duplicate-key detection, so this is a small hand-rolled JSON
 * walker whose only job is to notice a key repeated within the same
 * object and report where.
 *
 * Not wired into the runtime i18n lookup (`./index.ts`) — this is
 * verification tooling, not a primitive the app depends on.
 */

export interface DuplicateKeyIssue {
  /** Dot/bracket path to the object the duplicate was found in ('' = document root). */
  path: string
  key: string
  line: number
}

function lineAt(text: string, pos: number): number {
  let line = 1
  for (let k = 0; k < pos; k++) {
    if (text[k] === '\n') line++
  }
  return line
}

/**
 * Walks `text` as JSON and returns every key that appears more than once
 * within the same object. Throws on malformed JSON (that's JSON.parse's
 * job to report precisely — this walker only needs to succeed on
 * well-formed documents, which is all `locales/*.json` should ever be).
 */
export function findDuplicateJsonKeys(text: string): DuplicateKeyIssue[] {
  let i = 0
  const len = text.length
  const issues: DuplicateKeyIssue[] = []

  function skipWs(): void {
    while (i < len && /\s/.test(text[i]!)) i++
  }

  function parseString(): string {
    // Assumes text[i] === '"'. Returns the decoded string; only tracks
    // escape-sequence *boundaries* correctly (needed to not mistake an
    // escaped quote for the closing quote) — the decoded value itself is
    // discarded by every caller except when it's used as a key.
    const start = i
    i++
    let result = ''
    while (i < len) {
      const ch = text[i]
      if (ch === '"') {
        i++
        return result
      }
      if (ch === '\\') {
        const next = text[i + 1]
        switch (next) {
          case '"':
            result += '"'
            break
          case '\\':
            result += '\\'
            break
          case '/':
            result += '/'
            break
          case 'b':
            result += '\b'
            break
          case 'f':
            result += '\f'
            break
          case 'n':
            result += '\n'
            break
          case 'r':
            result += '\r'
            break
          case 't':
            result += '\t'
            break
          case 'u': {
            const hex = text.slice(i + 2, i + 6)
            result += String.fromCharCode(parseInt(hex, 16))
            i += 4
            break
          }
          default:
            result += next ?? ''
        }
        i += 2
        continue
      }
      result += ch
      i++
    }
    throw new Error(`Unterminated string starting at position ${start}`)
  }

  function parseValue(path: string): void {
    skipWs()
    const ch = text[i]
    if (ch === '{') {
      parseObject(path)
      return
    }
    if (ch === '[') {
      parseArray(path)
      return
    }
    if (ch === '"') {
      parseString()
      return
    }
    if (i >= len) throw new Error('Unexpected end of input')
    // number / true / false / null — consume up to the next structural char.
    while (i < len && !/[\s,\]}]/.test(text[i]!)) i++
  }

  function parseArray(path: string): void {
    i++ // '['
    skipWs()
    if (text[i] === ']') {
      i++
      return
    }
    for (;;) {
      parseValue(`${path}[]`)
      skipWs()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ']') {
        i++
        return
      }
      throw new Error(`Unexpected character '${text[i]}' in array at position ${i}`)
    }
  }

  function parseObject(path: string): void {
    i++ // '{'
    skipWs()
    const seen = new Set<string>()
    if (text[i] === '}') {
      i++
      return
    }
    for (;;) {
      skipWs()
      if (text[i] !== '"') throw new Error(`Expected string key at position ${i}`)
      const keyStart = i
      const key = parseString()
      if (seen.has(key)) {
        issues.push({ path, key, line: lineAt(text, keyStart) })
      }
      seen.add(key)
      skipWs()
      if (text[i] !== ':') throw new Error(`Expected ':' after key "${key}" at position ${i}`)
      i++
      parseValue(path ? `${path}.${key}` : key)
      skipWs()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === '}') {
        i++
        return
      }
      throw new Error(`Unexpected character '${text[i]}' in object at position ${i}`)
    }
  }

  skipWs()
  parseValue('')
  return issues
}
