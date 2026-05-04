'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { Card } from '../../../components/Card'
import { Money } from '../../../components/Money'
import { Icon } from '../../../components/Icons'
import { PaywallGate } from '../../../components/PaywallGate'
import { usePlus } from '../../../lib/plus'

type Txn = {
  id: string
  amount: number
  direction: 'debit' | 'credit'
  merchant: string | null
  note: string | null
  category_id: string | null
  payment_method: string | null
  source: string | null
  transacted_at: string
}

type Format = 'csv' | 'json' | 'pdf'

export default function ExportPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const { isPlus } = usePlus()
  const [busy, setBusy] = useState<Format | null>(null)

  const now = new Date()
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const defaultTo = now.toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [t, c, p] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .order('transacted_at', { ascending: false }),
        supabase.from('categories').select('id, name').eq('user_id', user.id),
        supabase.from('profiles').select('currency_code, locale').eq('id', user.id).single(),
      ])
      setTransactions((t.data ?? []) as Txn[])
      setCategories(c.data ?? [])
      setProfile(p.data)
      setLoading(false)
    }
    load()
  }, [])

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const d = t.transacted_at.slice(0, 10)
      return d >= dateFrom && d <= dateTo
    })
  }, [transactions, dateFrom, dateTo])

  const totalExpenses = filtered
    .filter((t) => t.direction === 'debit')
    .reduce((s, t) => s + t.amount, 0)
  const totalIncome = filtered
    .filter((t) => t.direction === 'credit')
    .reduce((s, t) => s + t.amount, 0)

  function fileBase() {
    return `murmur-${dateFrom}-to-${dateTo}`
  }

  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function exportCSV() {
    setBusy('csv')
    try {
      const headers = ['Date', 'Time', 'Merchant', 'Category', 'Direction', 'Amount', 'Currency', 'Payment Method', 'Source', 'Note']
      const rows = filtered.map((t) => [
        t.transacted_at.slice(0, 10),
        new Date(t.transacted_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false }),
        t.merchant ?? '',
        t.category_id ? catMap[t.category_id]?.name ?? '' : '',
        t.direction,
        t.amount.toFixed(2),
        currency,
        t.payment_method ?? '',
        t.source ?? '',
        t.note ?? '',
      ])
      const csv = '\uFEFF' + [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\r\n')
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`)
    } finally {
      setBusy(null)
    }
  }

  async function exportJSON() {
    setBusy('json')
    try {
      const payload = {
        app: 'Murmur',
        version: 1,
        exported_at: new Date().toISOString(),
        currency,
        date_range: { from: dateFrom, to: dateTo },
        transactions: filtered.map((t) => ({
          id: t.id,
          amount: t.amount,
          direction: t.direction,
          merchant: t.merchant,
          category: t.category_id ? catMap[t.category_id]?.name ?? null : null,
          payment_method: t.payment_method,
          source: t.source,
          note: t.note,
          transacted_at: t.transacted_at,
        })),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `${fileBase()}.json`)
    } finally {
      setBusy(null)
    }
  }

  async function exportPDF() {
    setBusy('pdf')
    try {
      const html = pdfHTML({
        from: dateFrom,
        to: dateTo,
        currency,
        locale,
        transactions: filtered,
        catMap,
        totalExpenses,
        totalIncome,
      })
      const win = window.open('', '_blank', 'width=900,height=1100')
      if (!win) {
        alert('Pop-ups blocked. Allow pop-ups to export PDF.')
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      // Slight delay so the print stylesheet applies before the dialog opens.
      setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch {
          // Ignored — user can still print from the menu.
        }
      }, 250)
    } finally {
      setBusy(null)
    }
  }

  if (!isPlus) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Toolbar title="Export" />
        <div style={{ padding: '0 24px 24px' }}>
          <PaywallGate
            feature="Data export"
            title="Take your data with you, in any shape."
            body="Export the full transaction history as CSV for spreadsheets, JSON for re-import, or a printable PDF for records and tax filings."
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar title="Export" />

      <div style={styles.content}>
        <div>
          <div style={{ fontFamily: font.serif, fontSize: 28, fontWeight: 500, color: colors.ink, letterSpacing: -0.6 }}>
            Export your data
          </div>
          <div style={{ fontSize: 13, color: colors.ink3, marginTop: 2 }}>
            Choose a date range and a format. Files stay local — Murmur never uploads exports.
          </div>
        </div>

        <Card title="Date range">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={styles.field}>
              <label style={styles.label}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.input} />
            </div>
          </div>
          <div style={styles.summary}>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Transactions</span>
              <span style={{ fontFamily: font.display, fontSize: 18, fontWeight: 700, color: colors.ink }}>{filtered.length}</span>
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Total expenses</span>
              <Money value={totalExpenses} currency={currency} locale={locale} size={18} serif={false} bold={700} />
            </div>
            <div style={styles.summaryItem}>
              <span style={styles.summaryLabel}>Total income</span>
              <Money
                value={totalIncome}
                currency={currency}
                locale={locale}
                size={18}
                serif={false}
                bold={700}
                showPositiveSign
                color={colors.income}
              />
            </div>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <FormatCard
            title="CSV"
            sub="Spreadsheets, accountants"
            disabled={busy != null || filtered.length === 0 || loading}
            busy={busy === 'csv'}
            onClick={exportCSV}
          />
          <FormatCard
            title="JSON"
            sub="Backup, re-import"
            disabled={busy != null || filtered.length === 0 || loading}
            busy={busy === 'json'}
            onClick={exportJSON}
          />
          <FormatCard
            title="PDF"
            sub="Records, tax filings"
            disabled={busy != null || filtered.length === 0 || loading}
            busy={busy === 'pdf'}
            onClick={exportPDF}
          />
        </div>
      </div>
    </div>
  )
}

function FormatCard({
  title,
  sub,
  disabled,
  busy,
  onClick,
}: {
  title: string
  sub: string
  disabled: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: colors.card,
        border: `0.5px solid ${colors.line}`,
        borderRadius: radius.xl,
        padding: '20px 22px',
        textAlign: 'left',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: font.serif, fontSize: 22, fontWeight: 500, color: colors.ink }}>{title}</div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: colors.accentSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon.download color={colors.accent} size={16} />
        </div>
      </div>
      <div style={{ fontFamily: font.sans, fontSize: 12, color: colors.ink3 }}>{sub}</div>
      <div style={{ fontFamily: font.sans, fontSize: 11, color: busy ? colors.accent : colors.ink4, marginTop: 4 }}>
        {busy ? 'Preparing…' : 'Click to download'}
      </div>
    </button>
  )
}

function pdfHTML(args: {
  from: string
  to: string
  currency: string
  locale: string
  transactions: Txn[]
  catMap: Record<string, { id: string; name: string }>
  totalExpenses: number
  totalIncome: number
}): string {
  const fmt = (v: number) =>
    new Intl.NumberFormat(args.locale, { style: 'currency', currency: args.currency }).format(v)
  const rows = args.transactions
    .map((t) => {
      const cat = t.category_id ? args.catMap[t.category_id]?.name ?? '' : ''
      const sign = t.direction === 'credit' ? '+' : '−'
      const color = t.direction === 'credit' ? '#3F5A3E' : '#1B1915'
      const date = t.transacted_at.slice(0, 10)
      return `<tr>
        <td>${escape(date)}</td>
        <td>${escape(t.merchant ?? '')}</td>
        <td>${escape(cat)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums;color:${color};font-weight:600">
          ${sign}${escape(fmt(t.amount).replace(/^[+−\-]/, ''))}
        </td>
      </tr>`
    })
    .join('')
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>Murmur · ${args.from} to ${args.to}</title>
<style>
  @page { margin: 28pt 32pt; size: letter; }
  * { box-sizing: border-box; }
  body {
    font-family: "New York", "Iowan Old Style", Georgia, serif;
    color: #1B1915; margin: 0;
  }
  .meta {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    color: #6C675E; font-size: 11px; letter-spacing: 0.6px; text-transform: uppercase;
    font-weight: 700;
  }
  h1 { font-weight: 500; font-size: 32px; letter-spacing: -0.6px; margin: 4px 0 24px; }
  .totals { display: flex; gap: 40px; margin-bottom: 24px; padding: 16px 20px;
    border: 0.5px solid rgba(40,36,28,0.12); border-radius: 12px; }
  .totals .item { display: flex; flex-direction: column; gap: 4px; }
  .totals .label { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    font-size: 11px; color: #6C675E; letter-spacing: 0.6px; text-transform: uppercase; font-weight: 700; }
  .totals .v { font-family: "New York", Georgia, serif; font-size: 22px; font-weight: 500; }
  .credit { color: #3F5A3E; }
  table { width: 100%; border-collapse: collapse;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; }
  thead th {
    text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.6px;
    text-transform: uppercase; color: #6C675E;
    padding: 8px 10px; border-bottom: 0.5px solid rgba(40,36,28,0.12);
  }
  tbody td { padding: 8px 10px; font-size: 12px; border-bottom: 0.5px solid rgba(40,36,28,0.06); }
  .footer {
    margin-top: 24px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    font-size: 10px; color: #9C9589;
  }
</style>
</head><body>
<div class="meta">Murmur · ${escape(args.from)} → ${escape(args.to)}</div>
<h1>Transactions</h1>
<div class="totals">
  <div class="item"><span class="label">Total expenses</span><span class="v">${escape(fmt(args.totalExpenses))}</span></div>
  <div class="item"><span class="label">Total income</span><span class="v credit">+${escape(fmt(args.totalIncome).replace(/^[+\-]/, ''))}</span></div>
  <div class="item"><span class="label">Transactions</span><span class="v">${args.transactions.length}</span></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Exported by Murmur · ${escape(new Date().toLocaleString(args.locale))} · ${args.transactions.length} transactions</div>
</body></html>`
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    padding: '8px 12px',
    background: colors.surface2,
    border: `0.5px solid ${colors.line}`,
    borderRadius: radius.md,
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink,
    outline: 'none',
  },
  summary: {
    display: 'flex',
    gap: 32,
    padding: '14px 16px',
    background: colors.surface2,
    borderRadius: radius.md,
    marginTop: 12,
  },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: 2 },
  summaryLabel: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.ink3,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
}
