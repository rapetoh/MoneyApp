'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { identifyMerchants } from '@voice-expense/ai'
import {
  parseCsv,
  hasHeaderRow,
  detectColumns,
  detectDateOrder,
  detectDecimalMark,
  detectSignConvention,
  parseAmount,
  buildImportRows,
  findDuplicates,
  importTransaction,
  descriptorsToIdentify,
  formatMoney,
  type Category,
  type ColumnMapping,
  type DateOrder,
  type SignConvention,
  type MerchantRule,
  type Database,
  type ImportRow,
} from '@voice-expense/shared'

const MAX_FILE_BYTES = 5 * 1024 * 1024
// /api/ai/parse-statement takes one PDF per call under Vercel's body cap.
const MAX_PDF_BYTES = 4 * 1024 * 1024
const CHUNK = 200

type StatementResponse = {
  currency: string | null
  rows: Array<{
    day: string
    description: string
    amount: number
    direction: 'debit' | 'credit'
    transfer: boolean
  }>
  dropped: number
}

// A year of PDF statements read one by one (docs/csv-import.md).
type Statements = {
  names: string[]
  rows: ImportRow[]
  /** Card payments and moves between the person's own accounts. */
  transfers: ImportRow[]
  dropped: number
  failed: string[]
  currencies: string[]
}

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

type Loaded = {
  name: string
  cells: string[][]
  header: boolean
  mapping: ColumnMapping
  dateOrder: DateOrder
  decimalMark: '.' | ','
  sign: SignConvention
}

const ROLE_LABEL: Record<keyof ColumnMapping, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  debit: 'Money out',
  credit: 'Money in',
  category: 'Category',
}
const SIGN_LABEL: Record<SignConvention, string> = {
  negative_is_expense: 'Negative is spending',
  positive_is_expense: 'Positive is spending',
  all_expenses: 'All spending',
  all_income: 'All income',
}
const ORDER_LABEL: Record<DateOrder, string> = {
  mdy: 'Month first',
  dmy: 'Day first',
  ymd: 'Year first',
}

/**
 * Import from a file on the web (docs/csv-import.md): the same reading,
 * naming, filing and duplicate rules as the phone
 * (packages/shared/src/domain/csvImport.ts), written straight to the
 * database in chunks.
 */
export default function ImportPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<{
    currency_code: string
    locale: string
    timezone: string
  } | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [existing, setExisting] = useState<
    Array<{ day: string; amount: number; direction: 'debit' | 'credit' }>
  >([])
  const [rules, setRules] = useState<MerchantRule[]>([])
  const [file, setFile] = useState<Loaded | null>(null)
  const [statements, setStatements] = useState<Statements | null>(null)
  const [includeTransfers, setIncludeTransfers] = useState(false)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; held: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadContext() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const [p, c, t, r] = await Promise.all([
      supabase
        .from('profiles')
        .select('currency_code, locale, timezone')
        .eq('id', user.id)
        .single(),
      supabase.from('categories').select('*').eq('user_id', user.id).eq('is_archived', false),
      supabase
        .from('transactions')
        .select('local_day, amount, direction')
        .eq('user_id', user.id)
        .eq('is_deleted', false),
      supabase
        .from('merchant_rules')
        .select('merchant_key, merchant_name, category_id')
        .eq('user_id', user.id),
    ])
    if (p.data)
      setProfile({
        currency_code: p.data.currency_code ?? 'USD',
        locale: p.data.locale ?? 'en',
        timezone: p.data.timezone ?? 'UTC',
      })
    setCategories((c.data ?? []) as unknown as Category[])
    setExisting(
      (
        (t.data ?? []) as Array<{
          local_day: string
          amount: number
          direction: 'debit' | 'credit'
        }>
      ).map((x) => ({ day: x.local_day, amount: Number(x.amount), direction: x.direction })),
    )
    setRules((r.data ?? []) as MerchantRule[])
  }

  useEffect(() => {
    void loadContext()
  }, [])

  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'
  const tz = profile?.timezone ?? 'UTC'

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (!files.length) return
    const pdfs = files.filter(isPdf)
    if (pdfs.length) return readStatements(pdfs, files.length - pdfs.length)
    return onFile(files[0])
  }

  /** Statements go one at a time: each is a model call of up to a minute,
   *  and the rows of all of them become one import. */
  async function readStatements(pdfs: File[], ignored: number) {
    setError(null)
    setResult(null)
    setFile(null)
    setStatements(null)
    setIncludeTransfers(false)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setError('Your session ended. Sign in again, then choose the statements.')
      return
    }
    const acc: Statements = {
      names: [],
      rows: [],
      transfers: [],
      dropped: 0,
      failed: [],
      currencies: [],
    }
    let line = 0
    for (let i = 0; i < pdfs.length; i++) {
      const f = pdfs[i]
      setProgress(
        pdfs.length === 1
          ? `Reading ${f.name}`
          : `Reading statement ${i + 1} of ${pdfs.length}: ${f.name}`,
      )
      if (f.size > MAX_PDF_BYTES) {
        acc.failed.push(`${f.name} (larger than 4 MB)`)
        continue
      }
      const reading = await readOneStatement(f, token)
      if (!reading) {
        acc.failed.push(f.name)
        continue
      }
      acc.names.push(f.name)
      acc.dropped += reading.dropped
      if (reading.currency && !acc.currencies.includes(reading.currency))
        acc.currencies.push(reading.currency)
      for (const r of reading.rows) {
        const row: ImportRow = {
          line: ++line,
          day: r.day,
          amount: r.amount,
          direction: r.direction,
          description: r.description,
          category: null,
        }
        ;(r.transfer ? acc.transfers : acc.rows).push(row)
      }
    }
    setProgress(null)
    // Statements arrive in whatever order they were picked; show them by date.
    acc.rows.sort((a, b) => a.day.localeCompare(b.day))
    acc.transfers.sort((a, b) => a.day.localeCompare(b.day))
    if (!acc.names.length) {
      setError(
        "Murmur couldn't read those statements. Check they are the PDF statements from your bank or card, then try again.",
      )
      return
    }
    if (ignored > 0)
      acc.failed.push(
        ignored === 1 ? '1 file that is not a PDF' : `${ignored} files that are not PDFs`,
      )
    setStatements(acc)
  }

  /** One statement, retried when the AI is busy (429) or hiccups (5xx). */
  async function readOneStatement(f: File, token: string): Promise<StatementResponse | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const form = new FormData()
      form.append('file', f, f.name)
      let res: Response
      try {
        res = await fetch('/api/ai/parse-statement', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
      } catch {
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      if (res.ok) return (await res.json()) as StatementResponse
      if (res.status === 429 || res.status >= 500) {
        const wait = Math.min(Number(res.headers.get('Retry-After')) || 20, 60)
        setProgress(`Waiting for the reader to free up (${wait} s)`)
        await new Promise((r) => setTimeout(r, wait * 1000))
        continue
      }
      return null
    }
    return null
  }

  async function onFile(f: File | undefined) {
    setError(null)
    setResult(null)
    setStatements(null)
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      setError('That file is too large. Choose a CSV under 5 MB, or export a shorter date range.')
      return
    }
    const cells = parseCsv(await f.text())
    const header = hasHeaderRow(cells)
    const mapping = detectColumns(cells, header)
    const body = cells.slice(header ? 1 : 0)
    const dateOrder = detectDateOrder(
      mapping.date != null ? body.map((r) => r[mapping.date!] ?? '') : [],
      locale,
    )
    const amountCells = body.flatMap((r) =>
      [mapping.amount, mapping.debit, mapping.credit]
        .filter((i): i is number => i != null)
        .map((i) => r[i] ?? ''),
    )
    const decimalMark = detectDecimalMark(amountCells)
    const signs =
      mapping.amount != null
        ? body
            .map((r) => parseAmount(r[mapping.amount!] ?? '', decimalMark))
            .filter((n): n is number => n != null)
        : []
    setFile({
      name: f.name,
      cells,
      header,
      mapping,
      dateOrder,
      decimalMark,
      sign: detectSignConvention(signs),
    })
  }

  const reading = useMemo(() => {
    const built = file
      ? buildImportRows(file.cells, file)
      : statements
        ? {
            rows: includeTransfers
              ? [...statements.rows, ...statements.transfers].sort((a, b) =>
                  a.day.localeCompare(b.day),
                )
              : statements.rows,
            skipped: [],
          }
        : null
    if (!built) return null
    const held = findDuplicates(built.rows, existing)
    const toImport = includeDuplicates ? built.rows : built.rows.filter((r) => !held.has(r.line))
    return { ...built, held, toImport }
  }, [file, statements, includeTransfers, existing, includeDuplicates])

  const columnNames = useMemo(() => {
    if (!file) return [] as string[]
    const width = Math.max(...file.cells.slice(0, 10).map((r) => r.length))
    return Array.from({ length: width }, (_, i) =>
      file.header && file.cells[0][i]
        ? file.cells[0][i]
        : `Column ${i + 1}: ${file.cells[file.header ? 1 : 0]?.[i] ?? ''}`.slice(0, 40),
    )
  }, [file])

  function setColumn(key: keyof ColumnMapping, value: string) {
    if (!file) return
    const i = value === '' ? null : Number(value)
    const mapping = { ...file.mapping, [key]: i }
    if (key === 'amount' && i != null) Object.assign(mapping, { debit: null, credit: null })
    if ((key === 'debit' || key === 'credit') && i != null) mapping.amount = null
    setFile({ ...file, mapping })
  }

  async function run() {
    if (!userId || !reading || reading.toImport.length === 0) return
    setError(null)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const token = session?.access_token
    const descriptors = descriptorsToIdentify(reading.toImport)
    setProgress(`Naming merchants 0 / ${descriptors.length}`)
    const identities = token
      ? await identifyMerchants({
          apiBaseUrl: '',
          authToken: token,
          descriptors,
          categories: categories.map((c) => c.name),
          onProgress: (done, total) => setProgress(`Naming merchants ${done} / ${total}`),
        })
      : new Map()
    const nowIso = new Date().toISOString()
    const txns = reading.toImport.map((r) =>
      importTransaction(r, identities.get(r.description.slice(0, 120).trim()), {
        userId,
        categories,
        rules,
        currency,
        tz,
        nowIso,
        newId: () => crypto.randomUUID(),
      }),
    )
    let saved = 0
    for (let i = 0; i < txns.length; i += CHUNK) {
      setProgress(`Saving ${i} / ${txns.length}`)
      const chunk = txns.slice(i, i + CHUNK)
      const { error: e } = await supabase
        .from('transactions')
        .insert(chunk as Database['public']['Tables']['transactions']['Insert'][])
      if (e) {
        setError(
          `Stopped after ${saved} transactions: ${e.message}. Import the file again to add the rest; what was saved will be skipped.`,
        )
        break
      }
      saved += chunk.length
    }
    setProgress(null)
    setResult({ count: saved, held: includeDuplicates ? 0 : reading.held.size })
    setFile(null)
    setStatements(null)
    await loadContext()
  }

  const m = file?.mapping
  const pairMode = m ? m.amount == null && m.debit != null && m.credit != null : false

  return (
    <div>
      <Toolbar title="Import" />
      <div style={s.content}>
        <div style={s.card}>
          <div style={s.title}>Import your history</div>
          <p style={s.body}>
            Choose your bank or card statements as PDFs, a whole year at once if you like, or a CSV
            file from a bank or another budgeting app (Mint, Monarch, YNAB, a spreadsheet). Every
            merchant gets its real name, logo and category, and money already in Murmur is held back
            so nothing counts twice. Amounts are read in {currency}.
          </p>
          <label style={{ ...s.fileBtn, opacity: progress ? 0.5 : 1 }}>
            {file || statements ? 'Choose other files' : 'Choose statements or a CSV'}
            <input
              type="file"
              multiple
              accept=".pdf,application/pdf,.csv,text/csv,text/plain"
              style={{ display: 'none' }}
              disabled={!!progress}
              onChange={(e) => {
                void onFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          <div style={s.note}>
            PDF statements are read by AI to find each transaction, then discarded. They are not
            stored.
          </div>
          {error && <div style={s.error}>{error}</div>}
          {progress && <div style={s.progress}>{progress}…</div>}
          {result && (
            <div style={s.done}>
              {result.count === 1 ? '1 transaction' : `${result.count} transactions`} imported.
              {result.held > 0
                ? ` ${result.held === 1 ? '1 was' : `${result.held} were`} already in Murmur and skipped.`
                : ''}{' '}
              <Link
                href="/dashboard/transactions"
                style={{ color: colors.accent, fontWeight: 600 }}
              >
                See them
              </Link>
            </div>
          )}
        </div>

        {statements && reading && !progress && (
          <div style={s.card}>
            <div style={s.fileName}>
              {statements.names.length === 1
                ? statements.names[0]
                : `${statements.names.length} statements`}
            </div>
            <div style={s.title}>
              {reading.rows.length === 1 ? '1 transaction' : `${reading.rows.length} transactions`}{' '}
              found
            </div>

            <table style={s.table}>
              <tbody>
                {reading.rows.slice(0, 8).map((r) => (
                  <tr key={r.line}>
                    <td style={s.td}>{r.day}</td>
                    <td style={{ ...s.td, width: '100%' }}>
                      {r.description || '-'}
                      {reading.held.has(r.line) && <span style={s.held}> already in Murmur</span>}
                    </td>
                    <td
                      style={{
                        ...s.td,
                        textAlign: 'right',
                        color: r.direction === 'credit' ? colors.accent : colors.ink,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {r.direction === 'debit' ? '−' : '+'}
                      {formatMoney(r.amount, currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reading.rows.length > 8 && (
              <div style={s.note}>
                and {reading.rows.length - 8} more, from {reading.rows[0]?.day} to{' '}
                {reading.rows[reading.rows.length - 1]?.day}.
              </div>
            )}

            {statements.transfers.length > 0 && (
              <label style={s.check}>
                <input
                  type="checkbox"
                  checked={includeTransfers}
                  onChange={(e) => setIncludeTransfers(e.target.checked)}
                  style={{ accentColor: colors.accent }}
                />
                {statements.transfers.length === 1
                  ? '1 card payment or transfer between your own accounts is left out so nothing counts twice. Include it'
                  : `${statements.transfers.length} card payments or transfers between your own accounts are left out so nothing counts twice. Include them`}
              </label>
            )}
            {reading.held.size > 0 && (
              <label style={s.check}>
                <input
                  type="checkbox"
                  checked={includeDuplicates}
                  onChange={(e) => setIncludeDuplicates(e.target.checked)}
                  style={{ accentColor: colors.accent }}
                />
                {reading.held.size === 1
                  ? '1 transaction is already in Murmur and will be skipped. Import it anyway'
                  : `${reading.held.size} transactions are already in Murmur and will be skipped. Import them anyway`}
              </label>
            )}
            {statements.currencies.some((c) => c !== currency) && (
              <div style={s.note}>
                These statements are in {statements.currencies.join(', ')}; amounts will be saved in{' '}
                {currency}, your Murmur currency.
              </div>
            )}
            {statements.failed.length > 0 && (
              <div style={s.note}>Not read: {statements.failed.join(', ')}.</div>
            )}

            <button
              style={{ ...s.primary, opacity: reading.toImport.length ? 1 : 0.4 }}
              disabled={!reading.toImport.length}
              onClick={run}
            >
              Import{' '}
              {reading.toImport.length === 1
                ? '1 transaction'
                : `${reading.toImport.length} transactions`}
            </button>
          </div>
        )}

        {file && reading && m && !progress && (
          <div style={s.card}>
            <div style={s.fileName}>{file.name}</div>
            <div style={s.title}>
              {reading.rows.length === 1 ? '1 transaction' : `${reading.rows.length} transactions`}{' '}
              found
            </div>

            <div style={s.grid}>
              {(
                [
                  'date',
                  'description',
                  ...(pairMode ? ['debit', 'credit'] : ['amount']),
                  'category',
                ] as Array<keyof ColumnMapping>
              ).map((key) => (
                <label key={key} style={s.field}>
                  <span style={s.label}>{ROLE_LABEL[key]}</span>
                  <select
                    style={s.select}
                    value={m[key] ?? ''}
                    onChange={(e) => setColumn(key, e.target.value)}
                  >
                    <option value="">None</option>
                    {columnNames.map((n, i) => (
                      <option key={i} value={i}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div style={s.optRow}>
              {!pairMode && (
                <label style={s.field}>
                  <span style={s.label}>Amounts</span>
                  <select
                    style={s.select}
                    value={file.sign}
                    onChange={(e) => setFile({ ...file, sign: e.target.value as SignConvention })}
                  >
                    {(Object.keys(SIGN_LABEL) as SignConvention[]).map((k) => (
                      <option key={k} value={k}>
                        {SIGN_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label style={s.field}>
                <span style={s.label}>Dates read as</span>
                <select
                  style={s.select}
                  value={file.dateOrder}
                  onChange={(e) => setFile({ ...file, dateOrder: e.target.value as DateOrder })}
                >
                  {(Object.keys(ORDER_LABEL) as DateOrder[]).map((k) => (
                    <option key={k} value={k}>
                      {ORDER_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <table style={s.table}>
              <tbody>
                {reading.rows.slice(0, 8).map((r) => (
                  <tr key={r.line}>
                    <td style={s.td}>{r.day}</td>
                    <td style={{ ...s.td, width: '100%' }}>
                      {r.description || '-'}
                      {reading.held.has(r.line) && <span style={s.held}> already in Murmur</span>}
                    </td>
                    <td
                      style={{
                        ...s.td,
                        textAlign: 'right',
                        color: r.direction === 'credit' ? colors.accent : colors.ink,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {r.direction === 'debit' ? '−' : '+'}
                      {formatMoney(r.amount, currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {reading.held.size > 0 && (
              <label style={s.check}>
                <input
                  type="checkbox"
                  checked={includeDuplicates}
                  onChange={(e) => setIncludeDuplicates(e.target.checked)}
                  style={{ accentColor: colors.accent }}
                />
                {reading.held.size === 1
                  ? '1 transaction is already in Murmur and will be skipped. Import it anyway'
                  : `${reading.held.size} transactions are already in Murmur and will be skipped. Import them anyway`}
              </label>
            )}
            {reading.skipped.length > 0 && (
              <div style={s.note}>
                {reading.skipped.length === 1 ? '1 line' : `${reading.skipped.length} lines`}{' '}
                without a date or amount will be skipped.
              </div>
            )}

            <button
              style={{ ...s.primary, opacity: reading.toImport.length ? 1 : 0.4 }}
              disabled={!reading.toImport.length}
              onClick={run}
            >
              Import{' '}
              {reading.toImport.length === 1
                ? '1 transaction'
                : `${reading.toImport.length} transactions`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  content: {
    padding: '0 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxWidth: 900,
    fontFamily: font.sans,
  },
  card: {
    background: colors.card,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.xl,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  title: {
    fontFamily: font.display,
    fontSize: 22,
    fontWeight: 600,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  body: { margin: 0, fontSize: 13.5, lineHeight: 1.55, color: colors.ink2, maxWidth: 640 },
  fileBtn: {
    alignSelf: 'flex-start',
    padding: '9px 16px',
    background: colors.ink,
    color: colors.bg,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    padding: '8px 12px',
    background: '#F4DDDD',
    color: '#A94646',
    borderRadius: radius.md,
    fontSize: 12.5,
  },
  progress: { fontSize: 13, color: colors.ink3, fontWeight: 600 },
  done: {
    padding: '10px 12px',
    background: colors.accentSoft,
    color: colors.ink,
    borderRadius: radius.md,
    fontSize: 13,
  },
  fileName: { fontSize: 12, color: colors.ink3, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 },
  optRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 },
  label: { fontSize: 11, color: colors.ink3, fontWeight: 600 },
  select: {
    padding: '8px 10px',
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink,
    background: colors.surface2,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  td: {
    padding: '8px 6px',
    borderTop: `0.5px solid ${colors.line}`,
    whiteSpace: 'nowrap',
    color: colors.ink2,
  },
  held: { fontSize: 11, color: colors.ink4, fontWeight: 600 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.ink2 },
  note: { fontSize: 12.5, color: colors.ink3 },
  primary: {
    alignSelf: 'flex-start',
    padding: '10px 18px',
    background: colors.accent,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: font.sans,
  },
}
