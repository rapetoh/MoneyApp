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
import { aggAmount } from '@voice-expense/shared'

type Txn = {
  id: string
  amount: number
  amount_in_profile_currency: number | null
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
    .reduce((s, t) => s + aggAmount(t), 0)
  const totalIncome = filtered
    .filter((t) => t.direction === 'credit')
    .reduce((s, t) => s + aggAmount(t), 0)

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
      // Dynamic import so jsPDF (~120KB) only loads when the user
      // actually exports — keeps the initial bundle the same shape as
      // before for users on free who never see this surface.
      const [{ jsPDF }, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const autoTable = autoTableModule.default

      const doc = new jsPDF({ unit: 'pt', format: 'letter' })
      const pageW = doc.internal.pageSize.getWidth()

      const fmt = (v: number) =>
        new Intl.NumberFormat(locale, { style: 'currency', currency }).format(v)

      // Header band — eyebrow + serif title + totals row, matching the
      // brand style of the previous HTML template (the visual we lost
      // is hand-crafted typography, which jsPDF doesn't have built-in;
      // we get a close enough match with the right sizes + colours).
      doc.setTextColor('#6C675E')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(`MURMUR · ${dateFrom} → ${dateTo}`, 40, 56)

      doc.setTextColor('#1B1915')
      doc.setFontSize(26)
      doc.setFont('times', 'normal')
      doc.text('Transactions', 40, 92)

      // Totals strip
      const totalsY = 124
      doc.setDrawColor(220, 216, 206)
      doc.setLineWidth(0.5)
      doc.roundedRect(40, totalsY - 18, pageW - 80, 64, 8, 8)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor('#6C675E')
      doc.text('TOTAL EXPENSES', 56, totalsY)
      doc.text('TOTAL INCOME', 56 + (pageW - 80) / 3, totalsY)
      doc.text('TRANSACTIONS', 56 + ((pageW - 80) / 3) * 2, totalsY)

      doc.setFont('times', 'normal')
      doc.setFontSize(16)
      doc.setTextColor('#1B1915')
      doc.text(fmt(totalExpenses), 56, totalsY + 22)
      doc.setTextColor('#3F5A3E')
      doc.text(
        `+${fmt(totalIncome).replace(/^[+\-]/, '')}`,
        56 + (pageW - 80) / 3,
        totalsY + 22,
      )
      doc.setTextColor('#1B1915')
      doc.text(
        String(filtered.length),
        56 + ((pageW - 80) / 3) * 2,
        totalsY + 22,
      )

      // Transaction table. autoTable paginates automatically and re-
      // emits the header on every page, so the user gets a clean
      // multi-page document for long ranges.
      autoTable(doc, {
        startY: totalsY + 60,
        head: [['Date', 'Merchant', 'Category', 'Amount']],
        body: filtered.map((t) => {
          const cat = t.category_id ? catMap[t.category_id]?.name ?? '' : ''
          const sign = t.direction === 'credit' ? '+' : '−'
          const display = fmt(t.amount).replace(/^[+−\-]/, '')
          return [t.transacted_at.slice(0, 10), t.merchant ?? '', cat, `${sign}${display}`]
        }),
        styles: { fontSize: 9, cellPadding: 6, lineColor: [225, 222, 213], lineWidth: 0.5 },
        headStyles: {
          fillColor: false,
          textColor: [108, 103, 94],
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: { top: 8, right: 6, bottom: 8, left: 6 },
        },
        columnStyles: {
          0: { cellWidth: 70 },
          3: { halign: 'right', cellWidth: 80, fontStyle: 'bold' },
        },
        didParseCell: (data) => {
          // Sage-tinted credits to match the brand colour for income.
          if (data.section === 'body' && data.column.index === 3) {
            const cell = data.cell.raw as string
            if (typeof cell === 'string' && cell.startsWith('+')) {
              data.cell.styles.textColor = [63, 90, 62]
            }
          }
        },
        theme: 'plain',
        margin: { left: 40, right: 40 },
      })

      // Footer on every page
      const pageCount = doc.getNumberOfPages()
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor('#9C9589')
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const h = doc.internal.pageSize.getHeight()
        doc.text(
          `Exported by Murmur · ${new Date().toLocaleString(locale)} · ${filtered.length} transactions`,
          40,
          h - 28,
        )
        doc.text(`Page ${i} / ${pageCount}`, pageW - 40, h - 28, { align: 'right' })
      }

      doc.save(`${fileBase()}.pdf`)
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
