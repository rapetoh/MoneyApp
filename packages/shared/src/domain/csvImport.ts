/**
 * CSV import (docs/csv-import.md, Oct 2026): a bank, card or other-app
 * export becomes Murmur transactions, on the phone and the web alike.
 *
 * Bank exports disagree on everything, so every decision here is made from
 * the file itself rather than assumed: the delimiter, whether there is a
 * header, which column is the date, the amount (one signed column, or a
 * debit and a credit column), the description and an optional category,
 * the date order (03/04 is March or April), and the decimal mark (1.234,56
 * or 1,234.56). The person sees the reading and can change any of it
 * before anything is saved.
 *
 * Already-logged money is not imported twice: a row matching an existing
 * transaction (same amount and direction, dated within two days, since a
 * bank posts a day or two after the purchase) is held back, each existing
 * transaction answering for one row at most.
 */
import { daysBetween, civilDateTimeToInstant } from '../utils/period'
import type { Category } from '../types/category'
import { resolveCategorySuggestion, guessCategoryFromMerchant } from './categoryResolver'
import { cleanMerchantDescriptor, normalizeMerchantCase, brandDomainForMerchant } from './merchantBrand'
import { learnedCategoryFor, type MerchantRule } from './merchantRules'

// ── Reading the file ─────────────────────────────────────────────────────

/** Rows of cells. Handles a byte-order mark, quoted cells with commas,
 *  newlines and doubled quotes, CRLF, and `,`, `;` or tab delimiters. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delimiter = detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += ch
    }
  }
  row.push(cell.trim())
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

function detectDelimiter(src: string): string {
  const firstLines = src.split(/\r?\n/).slice(0, 5).join('\n')
  const count = (d: string) => firstLines.split(d).length - 1
  const candidates: Array<[string, number]> = [
    [',', count(',')],
    [';', count(';')],
    ['\t', count('\t')],
  ]
  candidates.sort((a, b) => b[1] - a[1])
  return candidates[0][1] > 0 ? candidates[0][0] : ','
}

// ── Amounts ──────────────────────────────────────────────────────────────

export type DecimalMark = '.' | ','

/** Which decimal mark the file uses, read from the amount cells: "1.234,56"
 *  and "12,50" mean a comma; "1,234.56" and "12.50" mean a point. */
export function detectDecimalMark(samples: readonly string[]): DecimalMark {
  let comma = 0
  let point = 0
  for (const raw of samples) {
    const s = raw.replace(/[^\d.,]/g, '')
    if (/,\d{1,2}$/.test(s)) comma++
    else if (/\.\d{1,2}$/.test(s)) point++
  }
  return comma > point ? ',' : '.'
}

/** A signed number from a money cell, or null. Understands currency signs,
 *  thousands separators, "(12.50)", "12.50-", and "CR" / "DR" marks. */
export function parseAmount(raw: string, mark: DecimalMark = '.'): number | null {
  let s = raw.trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (/\bDR\b/i.test(s)) negative = true
  s = s.replace(/\b(CR|DR)\b/gi, '')
  if (/-\s*$/.test(s)) {
    negative = true
    s = s.replace(/-\s*$/, '')
  }
  if (/^\s*[-−]/.test(s) || /[-−]\s*[\d.,]/.test(s)) negative = !negative
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null
  if (mark === ',') s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

// ── Dates ────────────────────────────────────────────────────────────────

export type DateOrder = 'ymd' | 'mdy' | 'dmy'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janv: 1, fev: 2, fevr: 2, mars: 3, avr: 4, mai: 5, juin: 6, juil: 7, aout: 8, déc: 12, dic: 12, ene: 1,
  abr: 4, ago: 8, set: 9, out: 10, dez: 12, fév: 2, août: 8,
}

/** Day-first or month-first, read from the whole column: a first part above
 *  12 means day-first, a second part above 12 means month-first; when every
 *  date is ambiguous, the person's language decides (English month-first). */
export function detectDateOrder(samples: readonly string[], locale = 'en'): DateOrder {
  let dayFirst = 0
  let monthFirst = 0
  let yearFirst = 0
  for (const raw of samples) {
    const m = /^\s*(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/.exec(raw)
    if (!m) continue
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (m[1].length === 4) {
      yearFirst++
      continue
    }
    if (a > 12) dayFirst++
    else if (b > 12) monthFirst++
  }
  if (yearFirst > 0 && yearFirst >= dayFirst + monthFirst) return 'ymd'
  if (dayFirst > monthFirst) return 'dmy'
  if (monthFirst > dayFirst) return 'mdy'
  return locale === 'en' ? 'mdy' : 'dmy'
}

/** A civil day `YYYY-MM-DD` from a date cell, or null. */
export function parseDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim()
  if (!s) return null
  let y: number, m: number, d: number
  const num = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/.exec(s)
  if (num) {
    const [p1, p2, p3] = [num[1], num[2], num[3]]
    if (p1.length === 4) [y, m, d] = [Number(p1), Number(p2), Number(p3)]
    else if (order === 'dmy') [d, m, y] = [Number(p1), Number(p2), Number(p3)]
    else [m, d, y] = [Number(p1), Number(p2), Number(p3)]
  } else {
    // "Oct 5, 2026", "5 Oct 2026", "05-oct.-2026"
    const words = s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[.,]/g, ' ')
      .split(/[\s\-/]+/)
      .filter(Boolean)
    const month = words.map((w) => MONTHS[w] ?? MONTHS[w.slice(0, 3)]).find((v) => v != null)
    const nums = words.filter((w) => /^\d+$/.test(w)).map(Number)
    const year = nums.find((n) => n > 31)
    const day = nums.find((n) => n >= 1 && n <= 31)
    if (!month || year == null || day == null) return null
    ;[y, m, d] = [year, month, day]
  }
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1970 || y > 2100) return null
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCMonth() !== m - 1) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ── Columns ──────────────────────────────────────────────────────────────

export interface ColumnMapping {
  date: number | null
  /** One signed amount column... */
  amount: number | null
  /** ...or a money-out and a money-in column. */
  debit: number | null
  credit: number | null
  description: number | null
  category: number | null
}

const HEADER_WORDS: Record<keyof ColumnMapping, RegExp> = {
  date: /^(transaction |posted |posting |booking |value )?date|^fecha|^data$|^datum|^date d|^date de/i,
  amount: /^amount|^montant|^importe|^valor|^value|^sum|^betrag|^total/i,
  debit: /debit|withdrawal|money out|paid out|spent|^out$|d[ée]bit|cargo|retiro|sa[ií]da/i,
  credit: /credit|deposit|money in|paid in|received|^in$|cr[ée]dit|abono|ingreso|entrada/i,
  description: /description|merchant|payee|^name|narrative|libell[ée]|concepto|descri[çc][ãa]o|beneficiary|counterparty|^title/i,
  category: /categor/i,
}

/** Whether the first row names columns rather than holding a transaction. */
export function hasHeaderRow(rows: readonly string[][]): boolean {
  const first = rows[0]
  if (!first) return false
  const looksLikeData = first.some((c) => parseDate(c, 'mdy') != null) && first.some((c) => /\d/.test(c) && parseAmount(c) != null)
  return !looksLikeData
}

/** Best guess at each column, from header words, then from the values. */
export function detectColumns(rows: readonly string[][], header: boolean): ColumnMapping {
  const width = Math.max(0, ...rows.slice(0, 20).map((r) => r.length))
  const mapping: ColumnMapping = { date: null, amount: null, debit: null, credit: null, description: null, category: null }
  const taken = new Set<number>()
  const take = (key: keyof ColumnMapping, i: number) => {
    mapping[key] = i
    taken.add(i)
  }

  if (header) {
    const names = rows[0]
    // Debit/credit before amount: "Debit Amount" is a debit column.
    for (const key of ['date', 'debit', 'credit', 'amount', 'description', 'category'] as const) {
      const i = names.findIndex((n, idx) => !taken.has(idx) && HEADER_WORDS[key].test(n.trim()))
      if (i >= 0) take(key, i)
    }
    // Weaker description words ("Memo", "Details") only when nothing better
    // is named: Chase's "Details" column holds DEBIT or CREDIT.
    if (mapping.description == null) {
      const i = names.findIndex((n, idx) => !taken.has(idx) && /memo|details|reference|note/i.test(n.trim()))
      if (i >= 0) take('description', i)
    }
  }

  const data = rows.slice(header ? 1 : 0, (header ? 1 : 0) + 30)
  const share = (i: number, test: (c: string) => boolean) =>
    data.length ? data.filter((r) => r[i] != null && r[i] !== '' && test(r[i])).length / data.length : 0

  if (mapping.date == null) {
    for (let i = 0; i < width; i++) {
      if (!taken.has(i) && share(i, (c) => parseDate(c, 'mdy') != null || parseDate(c, 'dmy') != null) > 0.8) {
        take('date', i)
        break
      }
    }
  }
  if (mapping.amount == null && (mapping.debit == null || mapping.credit == null)) {
    for (let i = 0; i < width; i++) {
      if (!taken.has(i) && share(i, (c) => /\d/.test(c) && !/[a-z]{3,}/i.test(c) && parseAmount(c) != null) > 0.8) {
        take('amount', i)
        break
      }
    }
  }
  if (mapping.description == null) {
    // The widest mostly-text column.
    let best = -1
    let bestLen = 0
    for (let i = 0; i < width; i++) {
      if (taken.has(i)) continue
      const texty = share(i, (c) => /[a-z]{2,}/i.test(c))
      const avg = data.reduce((s, r) => s + (r[i]?.length ?? 0), 0) / Math.max(1, data.length)
      if (texty > 0.6 && avg > bestLen) {
        best = i
        bestLen = avg
      }
    }
    if (best >= 0) take('description', best)
  }
  // A lone debit or credit column next to an amount column is not a pair.
  if (mapping.amount != null && (mapping.debit == null) !== (mapping.credit == null)) {
    mapping.debit = null
    mapping.credit = null
  }
  return mapping
}

// ── Rows ─────────────────────────────────────────────────────────────────

/** How a single signed amount column reads. */
export type SignConvention = 'negative_is_expense' | 'positive_is_expense' | 'all_expenses' | 'all_income'

/** Negative and positive values both present: negative is money out (how
 *  banks export). Only one sign present: they are all expenses. */
export function detectSignConvention(amounts: readonly number[]): SignConvention {
  const neg = amounts.some((a) => a < 0)
  const pos = amounts.some((a) => a > 0)
  return neg && pos ? 'negative_is_expense' : 'all_expenses'
}

export interface ImportOptions {
  header: boolean
  mapping: ColumnMapping
  dateOrder: DateOrder
  decimalMark: DecimalMark
  sign: SignConvention
}

export interface ImportRow {
  /** 1-based line in the file, for "line 14 was skipped". */
  line: number
  day: string
  /** Positive. */
  amount: number
  direction: 'debit' | 'credit'
  description: string
  category: string | null
}

export interface ImportSkip {
  line: number
  reason: 'no_date' | 'no_amount' | 'zero'
}

export function buildImportRows(rows: readonly string[][], opts: ImportOptions): { rows: ImportRow[]; skipped: ImportSkip[] } {
  const out: ImportRow[] = []
  const skipped: ImportSkip[] = []
  const { mapping: m } = opts
  const start = opts.header ? 1 : 0
  for (let r = start; r < rows.length; r++) {
    const cells = rows[r]
    const line = r + 1
    const day = m.date != null ? parseDate(cells[m.date] ?? '', opts.dateOrder) : null
    if (!day) {
      skipped.push({ line, reason: 'no_date' })
      continue
    }
    let signed: number | null = null
    let direction: 'debit' | 'credit' = 'debit'
    if (m.debit != null && m.credit != null && m.amount == null) {
      const out_ = parseAmount(cells[m.debit] ?? '', opts.decimalMark)
      const in_ = parseAmount(cells[m.credit] ?? '', opts.decimalMark)
      if (out_ != null && out_ !== 0) {
        signed = Math.abs(out_)
        direction = 'debit'
      } else if (in_ != null && in_ !== 0) {
        signed = Math.abs(in_)
        direction = 'credit'
      } else if (out_ === 0 || in_ === 0) {
        signed = 0
      }
    } else if (m.amount != null) {
      const v = parseAmount(cells[m.amount] ?? '', opts.decimalMark)
      if (v != null) {
        signed = Math.abs(v)
        direction =
          opts.sign === 'all_expenses'
            ? 'debit'
            : opts.sign === 'all_income'
              ? 'credit'
              : opts.sign === 'negative_is_expense'
                ? (v < 0 ? 'debit' : 'credit')
                : (v > 0 ? 'debit' : 'credit')
      }
    }
    if (signed == null) {
      skipped.push({ line, reason: 'no_amount' })
      continue
    }
    if (Math.round(signed * 100) === 0) {
      skipped.push({ line, reason: 'zero' })
      continue
    }
    const description = (m.description != null ? cells[m.description] : '')?.replace(/\s+/g, ' ').trim() ?? ''
    const category = m.category != null ? (cells[m.category]?.trim() || null) : null
    out.push({ line, day, amount: Math.round(signed * 100) / 100, direction, description, category })
  }
  return { rows: out, skipped }
}

// ── Already in Murmur ────────────────────────────────────────────────────

export interface ExistingForDuplicates {
  /** Civil day in the profile's zone. */
  day: string
  amount: number
  direction: 'debit' | 'credit'
}

/** Days apart a bank's posting date may be from the logged purchase. */
export const DUPLICATE_DAY_TOLERANCE = 2

/**
 * Which import rows are already in Murmur: same amount to the cent, same
 * direction, within DUPLICATE_DAY_TOLERANCE days. Each existing
 * transaction matches one row at most, the nearest in date, so two real
 * $4.50 coffees in the file against one logged coffee import one.
 * Returns the `line`s to hold back.
 */
export function findDuplicates(rows: readonly ImportRow[], existing: readonly ExistingForDuplicates[]): Set<number> {
  const pool = new Map<string, Array<{ day: string; used: boolean }>>()
  for (const e of existing) {
    const key = `${e.direction}:${Math.round(e.amount * 100)}`
    const list = pool.get(key) ?? []
    list.push({ day: e.day, used: false })
    pool.set(key, list)
  }
  const dup = new Set<number>()
  for (const r of rows) {
    const list = pool.get(`${r.direction}:${Math.round(r.amount * 100)}`)
    if (!list) continue
    let best: { day: string; used: boolean } | null = null
    let bestGap = Infinity
    for (const cand of list) {
      if (cand.used) continue
      const gap = Math.abs(dayGap(r.day, cand.day))
      if (gap <= DUPLICATE_DAY_TOLERANCE && gap < bestGap) {
        best = cand
        bestGap = gap
      }
    }
    if (best) {
      best.used = true
      dup.add(r.line)
    }
  }
  return dup
}

function dayGap(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number)
  const [y2, m2, d2] = b.split('-').map(Number)
  return daysBetween(y1, m1, d1, y2, m2, d2)
}

// ── Rows to transactions ─────────────────────────────────────────────────

/** What the batch identifier said about one descriptor (see
 *  packages/ai/src/merchantBatch.ts). */
export interface MerchantIdentity {
  merchant: string | null
  merchant_domain: string | null
  /** One of the person's category names, or null. */
  category: string | null
}

export interface ImportContext {
  userId: string
  categories: readonly Category[]
  rules: readonly MerchantRule[]
  /** The profile currency: CSV amounts are read in it. */
  currency: string
  tz: string
  nowIso: string
  newId: () => string
}

/**
 * The transaction a CSV row becomes. The category comes from, in order: the
 * file's own category column when it matches one of the person's
 * categories, a category Murmur learned for that merchant, the AI's pick,
 * then the local merchant keywords. The name is the AI's, else the cleaned
 * descriptor. Dated at noon on its civil day in the profile's zone, so no
 * zone shift can move it to a neighbouring day. Same-currency, so the FX
 * snapshot is 1.
 */
export function importTransaction(row: ImportRow, identity: MerchantIdentity | undefined, ctx: ImportContext) {
  const [y, m, d] = row.day.split('-').map(Number)
  const transactedAt = civilDateTimeToInstant(y, m, d, 12, 0, 0, ctx.tz)
  const cleaned = normalizeMerchantCase(cleanMerchantDescriptor(row.description)) || row.description || null
  const merchant = (identity?.merchant ?? cleaned)?.slice(0, 200) || null
  const byName = (name: string | null | undefined) =>
    name ? (ctx.categories.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null) : null
  const valid = new Set(ctx.categories.map((c) => c.id))
  const categoryId =
    resolveCategorySuggestion(row.category, ctx.categories)?.category.id ??
    learnedCategoryFor(merchant, ctx.rules, valid) ??
    learnedCategoryFor(row.description, ctx.rules, valid) ??
    byName(identity?.category)?.id ??
    guessCategoryFromMerchant(row.description, ctx.categories)?.category.id ??
    null
  const id = ctx.newId()
  return {
    id,
    user_id: ctx.userId,
    amount: row.amount,
    direction: row.direction,
    currency_code: ctx.currency,
    category_id: categoryId,
    merchant,
    merchant_domain: identity?.merchant_domain ?? brandDomainForMerchant(row.description),
    note: null as string | null,
    payment_method: null as string | null,
    amount_in_profile_currency: row.amount,
    fx_rate_to_profile: 1,
    fx_rate_date: row.day,
    snapshot_currency: ctx.currency,
    transacted_at: transactedAt,
    local_day: row.day,
    source: 'import' as const,
    raw_transcript: null as string | null,
    ai_confidence: null as number | null,
    is_recurring: false,
    recurring_rule_id: null as string | null,
    recurring_frequency: null as string | null,
    client_id: id,
    client_created_at: ctx.nowIso,
    version: 1,
    is_deleted: false,
  }
}

/** The descriptors worth asking the AI about: distinct, non-empty, trimmed
 *  to what the endpoint accepts, most frequent first so the merchants that
 *  matter most are named first. */
export function descriptorsToIdentify(rows: readonly ImportRow[], maxLength = 120): string[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const d = r.description.slice(0, maxLength).trim()
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d)
}
