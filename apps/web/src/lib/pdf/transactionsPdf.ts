// Transactions PDF — the document behind Export → PDF (web + desktop).
//
// Why this is its own module and not inline in the export page (Aug 16,
// 2026 owner review of the shipped PDF): the previous inline version
// used jsPDF's built-in "standard 14" fonts, which are WinAnsi-only.
// Every character outside that 8-bit table — the typographic minus
// U+2212 on each debit, the → in the header's date range, the narrow
// no-break space `Intl.NumberFormat` emits for fr/de — printed as a
// stray glyph with a bogus advance width, which smeared every amount
// column ("  " $ 5 0 . 0 0 "). The document also had no brand mark,
// printed income rows with a blank category, drew a full boxed grid,
// and duplicated the amount column for single-currency users.
//
// This module renders the document from *assets passed in* (fonts as
// base64, nothing else) so it is a pure function of its input: the page
// fetches the fonts (`loadPdfFonts`, below) and a node test can read
// the same files from disk and rasterise the result.
//
// Typography: Plus Jakarta Sans — the app's own self-hosted sans — in a
// derived build with tabular figures as the default digits, produced by
// apps/web/scripts/build-pdf-fonts.py into apps/web/public/fonts/. The
// title keeps jsPDF's Times (the closest built-in to the brand serif),
// which is safe because the title is a fixed ASCII string; every string
// that can carry user or locale data goes through the embedded font.
import type { jsPDF } from 'jspdf'
import type { CellHookData, UserOptions } from 'jspdf-autotable'
import type { ExportRow } from '@voice-expense/shared'

// ── Palette (mirrors apps/web/src/lib/theme.ts; jsPDF wants tuples) ─────────
const INK: [number, number, number] = [27, 25, 21] // #1B1915
const INK2: [number, number, number] = [58, 54, 48] // #3A3630
const INK3: [number, number, number] = [108, 103, 94] // #6C675E
const INK4: [number, number, number] = [156, 149, 137] // #9C9589
const INCOME: [number, number, number] = [74, 124, 89] // #4A7C59
const SAGE: [number, number, number] = [63, 90, 62] // #3F5A3E
const CREAM: [number, number, number] = [251, 250, 247] // #FBFAF7
const SURFACE2: [number, number, number] = [245, 242, 235] // #F5F2EB
// theme `line` is rgba(40,36,28,0.08); flattened onto white paper.
const LINE: [number, number, number] = [234, 232, 227]
const LINE_STRONG: [number, number, number] = [214, 211, 203]

const FONT = 'MurmurSans'
const PAGE_MARGIN = 44

export type PdfFonts = { regular: string; semibold: string } // base64 TTFs

export type TransactionsPdfInput = {
  rows: ExportRow[]
  /** Profile currency — the unit of every total and of the converted column. */
  currency: string
  locale: string
  timezone: string
  dateFrom: string // YYYY-MM-DD, inclusive
  dateTo: string // YYYY-MM-DD, inclusive
  totalExpenses: number
  totalIncome: number
  /** Rows still awaiting an FX snapshot — excluded from the totals. */
  pendingCount: number
  /** Injected so tests are deterministic. */
  now?: Date
  fonts: PdfFonts
}

/** Characters `Intl` emits that a PDF font either lacks (U+202F narrow
 *  no-break space, U+2009 thin space) or that we do not want to embed as
 *  a distinct glyph — folded to a plain space. Every user-facing string
 *  passes through this once, right before it hits `doc.text`. */
export function pdfSafe(s: string): string {
  return s.replace(/[\u00A0\u2007\u2009\u202F]/g, ' ')
}

// ── Formatting ───────────────────────────────────────────────────────────────

function makeFormatters(input: TransactionsPdfInput) {
  const money = (v: number, currency: string) =>
    pdfSafe(
      new Intl.NumberFormat(input.locale, { style: 'currency', currency }).format(Math.abs(v)),
    )
  /** Signed amount: `−$50.00` for debits, `+$1,500.00` for credits. */
  const signed = (v: number, currency: string, direction: 'debit' | 'credit') =>
    `${direction === 'credit' ? '+' : '−'}${money(v, currency)}`
  const day = new Intl.DateTimeFormat(input.locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  // Rows carry a local civil day (`YYYY-MM-DD` in the profile zone,
  // fix-plan 1.3) — pin it to noon UTC and format in UTC so the printed
  // day can never roll over, whatever zone this code runs in.
  const civil = (ymd: string) => new Date(`${ymd}T12:00:00Z`)
  const dayText = (ymd: string) => pdfSafe(day.format(civil(ymd)))
  const rangeText = (() => {
    const from = civil(input.dateFrom)
    const to = civil(input.dateTo)
    try {
      return pdfSafe(day.formatRange(from, to))
    } catch {
      return `${dayText(input.dateFrom)} – ${dayText(input.dateTo)}`
    }
  })()
  const exportedAt = pdfSafe(
    new Intl.DateTimeFormat(input.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: input.timezone,
    }).format(input.now ?? new Date()),
  )
  return { money, signed, dayText, rangeText, exportedAt }
}

/** What the Category column prints. The data layer keeps '' / null for
 *  "no category" (CSV/JSON stay honest); the printed document reads
 *  "Income" for an uncategorised credit — which is what it is — and an
 *  em dash for an uncategorised debit. */
export function categoryLabel(row: Pick<ExportRow, 'category' | 'direction'>): string {
  if (row.category) return row.category
  return row.direction === 'credit' ? 'Income' : '-'
}

// ── Brand mark (vector) ──────────────────────────────────────────────────────
//
// Coin & Wave on a sage tile — the same geometry as components/MurmurMark
// .tsx (variant "sage", rounded): 160-unit grid, coin r=62 at (80,80)
// scaled by COIN_TILE_RATIO / (124/160) so the coin sits on the 75%
// keyline; primary wave at y=80, secondary at y=96. Quadratic Béziers
// from the SVG converted to cubics because PDF has no quadratic op.
const TILE_SCALE = 0.75 / (124 / 160)

function drawMurmurMark(doc: jsPDF, x: number, y: number, size: number) {
  const k = size / 160
  const g = (gx: number, gy: number): [number, number] => [
    x + (80 + (gx - 80) * TILE_SCALE) * k,
    y + (80 + (gy - 80) * TILE_SCALE) * k,
  ]
  // Tile
  doc.setFillColor(...SAGE)
  doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, 'F')
  // Coin
  const [cx, cy] = g(80, 80)
  doc.setFillColor(...CREAM)
  doc.circle(cx, cy, 62 * TILE_SCALE * k, 'F')

  // Quadratic (p0, c, p1) → cubic control points.
  const quad = (
    p0: [number, number],
    c: [number, number],
    p1: [number, number],
  ): { op: 'c'; c: number[] } => {
    const [x0, y0] = g(...p0)
    const [xc, yc] = g(...c)
    const [x1, y1] = g(...p1)
    return {
      op: 'c',
      c: [
        x0 + (2 / 3) * (xc - x0),
        y0 + (2 / 3) * (yc - y0),
        x1 + (2 / 3) * (xc - x1),
        y1 + (2 / 3) * (yc - y1),
        x1,
        y1,
      ],
    }
  }
  const wave = (pts: Array<[number, number]>, width: number, color: [number, number, number]) => {
    doc.setDrawColor(...color)
    doc.setLineWidth(width * TILE_SCALE * k)
    doc.setLineCap('round')
    const [m0, c0, p1, c1, p2, c2, p3] = pts
    doc.path([{ op: 'm', c: g(...m0) }, quad(m0, c0, p1), quad(p1, c1, p2), quad(p2, c2, p3)])
    doc.stroke()
  }
  // "M40 80 Q55 64 70 80 T100 80 T130 80" — T reflects the previous control.
  wave(
    [
      [40, 80],
      [55, 64],
      [70, 80],
      [85, 96],
      [100, 80],
      [115, 64],
      [130, 80],
    ],
    5,
    SAGE,
  )
  // "M40 96 Q55 86 70 96 T100 96 T120 96", drawn at 45% — flattened
  // onto cream because we deliberately avoid PDF transparency groups.
  wave(
    [
      [40, 96],
      [55, 86],
      [70, 96],
      [85, 106],
      [100, 96],
      [115, 86],
      [120, 96],
    ],
    3,
    [166, 178, 164],
  )
  doc.setLineCap('butt')
}

// ── Document ─────────────────────────────────────────────────────────────────

function registerFonts(doc: jsPDF, fonts: PdfFonts) {
  doc.addFileToVFS('murmur-pdf-regular.ttf', fonts.regular)
  doc.addFont('murmur-pdf-regular.ttf', FONT, 'normal')
  doc.addFileToVFS('murmur-pdf-semibold.ttf', fonts.semibold)
  doc.addFont('murmur-pdf-semibold.ttf', FONT, 'bold')
}

export function buildTransactionsPdf(
  doc: jsPDF,
  autoTable: (d: jsPDF, o: UserOptions) => void,
  input: TransactionsPdfInput,
): jsPDF {
  registerFonts(doc, input.fonts)
  const f = makeFormatters(input)
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const left = PAGE_MARGIN
  const right = pageW - PAGE_MARGIN
  const contentW = right - left
  const rows = input.rows

  const text = (
    s: string,
    x: number,
    y: number,
    opts?: { align?: 'left' | 'right' | 'center'; charSpace?: number },
  ) => doc.text(pdfSafe(s), x, y, opts)

  // ── Header: brand row + export timestamp ────────────────────────────
  drawMurmurMark(doc, left, 40, 24)
  doc.setFont(FONT, 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  text('Murmur', left + 24 + 9, 56.5)

  doc.setFont(FONT, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...INK3)
  text(`Exported ${f.exportedAt}`, right, 56, { align: 'right' })

  doc.setDrawColor(...LINE_STRONG)
  doc.setLineWidth(0.5)
  doc.line(left, 78, right, 78)

  // ── Title block ─────────────────────────────────────────────────────
  doc.setFont('times', 'normal')
  doc.setFontSize(26)
  doc.setTextColor(...INK)
  text('Transactions', left, 118)

  doc.setFont(FONT, 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...INK3)
  const n = rows.length
  text(
    `${n} transaction${n === 1 ? '' : 's'} · ${f.rangeText} · Amounts in ${input.currency}`,
    left,
    136,
  )

  // ── Totals strip ────────────────────────────────────────────────────
  const stripY = 154
  const stripH = 58
  doc.setFillColor(...SURFACE2)
  doc.roundedRect(left, stripY, contentW, stripH, 8, 8, 'F')

  const net = input.totalIncome - input.totalExpenses
  const cells: Array<{ label: string; value: string; color: [number, number, number] }> = [
    {
      label: 'TOTAL EXPENSES',
      value: `−${f.money(input.totalExpenses, input.currency)}`,
      color: INK,
    },
    {
      label: 'TOTAL INCOME',
      value: `+${f.money(input.totalIncome, input.currency)}`,
      color: INCOME,
    },
    {
      label: 'NET',
      value: `${net < 0 ? '−' : '+'}${f.money(net, input.currency)}`,
      color: net < 0 ? INK : INCOME,
    },
    { label: 'TRANSACTIONS', value: String(n), color: INK },
  ]
  const inset = 16
  const cellW = (contentW - inset * 2) / cells.length
  cells.forEach((c, i) => {
    const cx = left + inset + i * cellW
    doc.setFont(FONT, 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...INK3)
    text(c.label, cx, stripY + 19, { charSpace: 0.5 })
    doc.setFontSize(15)
    doc.setTextColor(...c.color)
    text(c.value, cx, stripY + 41)
  })

  // ── Table ───────────────────────────────────────────────────────────
  // The native-currency column only earns its place when at least one
  // row is in a currency other than the profile's — otherwise it is a
  // verbatim duplicate of the converted column, and a single "Amount"
  // column *is* the profile currency, so the printed total still
  // reconciles with a reader summing it (fix-plan 2.15's requirement).
  const multiCurrency = rows.some((r) => r.currency !== input.currency)
  const head = multiCurrency
    ? ['Date', 'Merchant', 'Category', 'Amount', `Amount (${input.currency})`]
    : ['Date', 'Merchant', 'Category', 'Amount']
  const body = rows.map((r) => {
    const converted =
      r.amountInProfileCurrency != null
        ? f.signed(r.amountInProfileCurrency, input.currency, r.direction)
        : '-'
    const cellsRow = [f.dayText(r.date), r.merchant || '-', categoryLabel(r)]
    if (multiCurrency) cellsRow.push(f.signed(r.amount, r.currency, r.direction))
    cellsRow.push(converted)
    return cellsRow.map(pdfSafe)
  })
  const amountCols = multiCurrency ? [3, 4] : [3]
  const lastCol = head.length - 1

  const columnStyles: UserOptions['columnStyles'] = {
    0: { cellWidth: 78, textColor: INK3, cellPadding: { top: 7, bottom: 7, left: 0, right: 6 } },
    1: { fontStyle: 'bold', textColor: INK },
    2: { cellWidth: multiCurrency ? 108 : 132, textColor: INK2 },
  }
  for (const c of amountCols) {
    columnStyles[c] = {
      cellWidth: multiCurrency ? 84 : 92,
      halign: 'right',
      fontStyle: 'bold',
      textColor: INK,
      cellPadding: { top: 7, bottom: 7, left: 6, right: c === lastCol ? 0 : 6 },
    }
  }

  autoTable(doc, {
    startY: stripY + stripH + 18,
    head: [head],
    body,
    theme: 'plain',
    margin: { left, right: PAGE_MARGIN, top: 44, bottom: 56 },
    styles: {
      font: FONT,
      fontSize: 9,
      cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
      lineColor: LINE,
      lineWidth: { bottom: 0.5 },
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: false,
      textColor: INK3,
      fontStyle: 'bold',
      fontSize: 7,
      lineColor: LINE_STRONG,
      lineWidth: { bottom: 0.75 },
      cellPadding: { top: 4, bottom: 7, left: 6, right: 6 },
    },
    columnStyles,
    didParseCell: (data: CellHookData) => {
      if (data.section === 'head') {
        data.cell.text = data.cell.text.map((t) => t.toUpperCase())
        if (data.column.index === 0)
          data.cell.styles.cellPadding = { top: 4, bottom: 7, left: 0, right: 6 }
        if (data.column.index === lastCol)
          data.cell.styles.cellPadding = { top: 4, bottom: 7, left: 6, right: 0 }
        return
      }
      if (data.section === 'body' && amountCols.includes(data.column.index)) {
        const row = rows[data.row.index]
        if (row?.direction === 'credit') data.cell.styles.textColor = INCOME
      }
    },
  })

  // ── Footer on every page ────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  const pendingNote =
    input.pendingCount > 0
      ? ` · ${input.pendingCount} awaiting currency conversion, excluded from totals`
      : ''
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.5)
    doc.line(left, pageH - 40, right, pageH - 40)
    doc.setFont(FONT, 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...INK4)
    text(`Murmur · Transactions · ${f.rangeText}${pendingNote}`, left, pageH - 27)
    text(`Page ${i} of ${pageCount}`, right, pageH - 27, { align: 'right' })
  }

  return doc
}

// ── Browser-side asset loading ───────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

let fontsPromise: Promise<PdfFonts> | null = null

/** Fetches the embedded fonts from /public (served by the Next server on
 *  web and by the embedded standalone server on desktop — see
 *  apps/desktop/scripts/bundle-web.mjs, which stages `public/`). Fetched
 *  once per session; failures reset the cache so a retry can succeed. */
export function loadPdfFonts(): Promise<PdfFonts> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const load = async (name: string) => {
        const res = await fetch(`/fonts/${name}`)
        if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`)
        return bytesToBase64(new Uint8Array(await res.arrayBuffer()))
      }
      const [regular, semibold] = await Promise.all([
        load('murmur-pdf-regular.ttf'),
        load('murmur-pdf-semibold.ttf'),
      ])
      return { regular, semibold }
    })().catch((e) => {
      fontsPromise = null
      throw e
    })
  }
  return fontsPromise
}
