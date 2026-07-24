'use client'
import { useState, useMemo, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase/client'
import { colors, font, radius } from '../../../lib/theme'
import { Toolbar } from '../../../components/Toolbar'
import { MerchantLogo } from '../../../components/MerchantLogo'
import { Chip } from '../../../components/Chip'
import { Money } from '../../../components/Money'
import { Icon } from '../../../components/Icons'
import { MonthPicker } from '../../../components/MonthPicker'
import { currentMonthIso, parseMonthIso } from '../../../lib/monthIso'

type Txn = {
  id: string
  amount: number
  direction: 'debit' | 'credit'
  merchant: string | null
  merchant_domain: string | null
  note: string | null
  category_id: string | null
  payment_method: string | null
  source: string | null
  transacted_at: string
  is_recurring?: boolean
}
type Cat = { id: string; name: string; color?: string | null }

type FilterKey = 'all' | 'voice' | 'apple-pay' | 'recurring' | 'income'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'voice', label: 'Voice' },
  { key: 'apple-pay', label: 'Apple Pay' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'income', label: 'Income' },
]

function classifySource(t: Txn): 'voice' | 'apple-pay' | 'typed' | 'recurring' {
  // Recurring takes precedence — it's the most useful chip on a row
  // that's both recurring and (e.g.) voice-logged.
  if (t.is_recurring || t.source === 'recurring_generated') return 'recurring'
  if (t.source === 'voice') return 'voice'
  if (t.source === 'shortcut' || t.source === 'notification_listener') return 'apple-pay'
  return 'typed'
}

function matchesFilter(t: Txn, f: FilterKey): boolean {
  if (f === 'all') return true
  if (f === 'income') return t.direction === 'credit'
  return classifySource(t) === f
}

export default function TransactionsPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const initialQ = searchParams.get('q') ?? ''
  const filterParam = (searchParams.get('filter') as FilterKey) || 'all'
  const monthParam = searchParams.get('month') ?? null
  const monthIso = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : currentMonthIso()
  // "All time" mode = no ?month=. Picking a month from the picker writes
  // ?month=YYYY-MM; the trash/clear button removes it. We check the raw
  // param so the default view is "All time" rather than "current month".
  const monthFilterActive = !!monthParam && /^\d{4}-\d{2}$/.test(monthParam)
  const { year: monthY, month: monthM } = parseMonthIso(monthParam ?? undefined)
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [categories, setCategories] = useState<Cat[]>([])
  const [profile, setProfile] = useState<{ currency_code?: string; locale?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQ)
  const [filter, setFilter] = useState<FilterKey>(filterParam)

  // Re-sync the in-page search when the toolbar pushes a new ?q= via the
  // global search field. Without this, navigating from another tab to
  // /dashboard/transactions?q=foo wouldn't update the input.
  useEffect(() => {
    setSearch(initialQ)
  }, [initialQ])

  useEffect(() => {
    setFilter(filterParam)
  }, [filterParam])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [txns, cats, prof] = await Promise.all([
        supabase
          .from('transactions')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .order('transacted_at', { ascending: false }),
        supabase
          .from('categories')
          .select('id, name, color')
          .eq('user_id', user.id)
          .eq('is_archived', false),
        supabase.from('profiles').select('currency_code, locale').eq('id', user.id).single(),
      ])
      setTransactions((txns.data ?? []) as Txn[])
      setCategories((cats.data ?? []) as Cat[])
      setProfile(prof.data)
      setLoading(false)
    }
    load()
  }, [])

  // Realtime. The channel name + the postgres_changes filter both
  // include the user's id so Supabase only sends this client the
  // changes it actually needs — without that filter Realtime
  // broadcasts every change on the `transactions` table to every
  // subscribed user. Random suffix keeps React Strict Mode's
  // double-invoke from colliding on the same channel name.
  useEffect(() => {
    let active = true
    let channel: ReturnType<typeof supabase.channel> | null = null
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return
      const userId = user.id
      channel = supabase
        .channel(`web:transactions:${userId}:${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
          async () => {
            const { data } = await supabase
              .from('transactions')
              .select('*')
              .eq('user_id', userId)
              .eq('is_deleted', false)
              .order('transacted_at', { ascending: false })
            if (data && active) setTransactions(data as Txn[])
          },
        )
        .subscribe()
    })()
    return () => {
      active = false
      if (channel) {
        channel.unsubscribe()
        void supabase.removeChannel(channel)
      }
    }
  }, [])

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const currency = profile?.currency_code ?? 'USD'
  const locale = profile?.locale ?? 'en'

  function pickFilter(f: FilterKey) {
    setFilter(f)
    const params = new URLSearchParams(searchParams.toString())
    if (f === 'all') params.delete('filter')
    else params.set('filter', f)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const monthStart = useMemo(() => new Date(monthY, monthM, 1, 0, 0, 0, 0), [monthY, monthM])
  const monthEnd = useMemo(
    () => new Date(monthY, monthM + 1, 0, 23, 59, 59, 999),
    [monthY, monthM],
  )

  // Filter / search
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (!matchesFilter(t, filter)) return false
      if (monthFilterActive) {
        const d = new Date(t.transacted_at)
        if (d < monthStart || d > monthEnd) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (
          !(t.merchant ?? '').toLowerCase().includes(q) &&
          !(t.note ?? '').toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [transactions, search, filter, monthFilterActive, monthStart, monthEnd])

  // Subtitle counts. When a month filter is active we count just that
  // month so the subtitle reflects what the user sees; when "All time" we
  // count everything in the dataset.
  const sourceSet = useMemo(
    () =>
      monthFilterActive
        ? transactions.filter((t) => {
            const d = new Date(t.transacted_at)
            return d >= monthStart && d <= monthEnd
          })
        : transactions,
    [transactions, monthFilterActive, monthStart, monthEnd],
  )
  const counts = useMemo(() => {
    let voice = 0
    let applePay = 0
    let typed = 0
    let recurring = 0
    for (const t of sourceSet) {
      const k = classifySource(t)
      if (k === 'voice') voice += 1
      else if (k === 'apple-pay') applePay += 1
      else if (k === 'typed') typed += 1
      else recurring += 1
    }
    return { voice, applePay, typed, recurring }
  }, [sourceSet])

  // Subtitle label — "April 2026" when filtering by a month, "All time"
  // otherwise.
  const subtitleLabel = monthFilterActive
    ? monthStart.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : 'All time'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        title="Transactions"
        searchInitial={search}
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <MonthPicker
              selected={monthIso}
              locale={locale}
              clearable
              cleared={!monthFilterActive}
              clearLabel="All time"
            />
            <Link
              href="/dashboard/export"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: colors.ink,
                color: '#fff',
                borderRadius: radius.md,
                fontFamily: font.sans,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Icon.list color="#fff" size={12} />
              Export CSV
            </Link>
          </div>
        }
      />

      <div style={styles.content}>
        <div style={styles.headerRow}>
          <div>
            <div style={styles.serifTitle}>{sourceSet.length} transactions</div>
            <div style={styles.subtitleLine}>
              {subtitleLabel} · {counts.voice} voice · {counts.applePay} Apple Pay ·{' '}
              {counts.typed} typed · {counts.recurring} recurring
            </div>
          </div>
          <div style={styles.filterTabs}>
            {FILTERS.map((f) => {
              const on = f.key === filter
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => pickFilter(f.key)}
                  style={{
                    ...styles.filterTab,
                    background: on ? colors.ink : 'transparent',
                    color: on ? '#fff' : colors.ink3,
                    border: on ? 'none' : `0.5px solid ${colors.line}`,
                  }}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Table */}
        <div style={styles.tableCard}>
          <div style={styles.tableHead}>
            <div>Date</div>
            <div>Merchant</div>
            <div>Category</div>
            <div>Source</div>
            <div>Account</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
          </div>
          <div style={styles.tableBody}>
            {loading ? (
              <div style={styles.empty}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={styles.empty}>No transactions match these filters.</div>
            ) : (
              filtered.map((t, i) => {
                const cat = t.category_id ? catMap[t.category_id] : null
                const catName = cat?.name ?? null
                const catColor = cat?.color ?? null
                const src = classifySource(t)
                const isIncome = t.direction === 'credit'
                const dt = new Date(t.transacted_at)
                const dateLabel = dt.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
                const timeLabel = dt
                  .toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
                  .replace(' ', '')
                  .toLowerCase()
                return (
                  <div
                    key={t.id}
                    style={{
                      ...styles.tableRow,
                      borderBottom: i === filtered.length - 1 ? 'none' : `0.5px solid ${colors.line}`,
                    }}
                  >
                    <div style={styles.dateCell}>
                      {dateLabel} <span style={{ color: colors.ink4 }}>· {timeLabel}</span>
                    </div>
                    <div style={styles.merchantCell}>
                      <MerchantLogo
                        name={t.merchant}
                        merchantDomain={t.merchant_domain}
                        categoryName={catName}
                        categoryColor={catColor}
                        size={28}
                        radius={8}
                      />
                      <span
                        style={{
                          color: colors.ink,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.merchant ?? 'Unnamed'}
                      </span>
                      {t.is_recurring && <Icon.recurring color={colors.accent} size={11} />}
                    </div>
                    <div>
                      {catName ? (
                        <Chip label={catName} categoryName={catName} size="sm" />
                      ) : isIncome ? (
                        <span style={styles.incomeChip}>INCOME</span>
                      ) : (
                        <span style={{ fontSize: 11, color: colors.ink4 }}>—</span>
                      )}
                    </div>
                    <div>
                      <SourceChip src={src} />
                    </div>
                    <div style={{ color: colors.ink3, fontSize: 12 }}>Murmur</div>
                    <div style={{ textAlign: 'right' }}>
                      <Money
                        value={isIncome ? t.amount : -t.amount}
                        currency={currency}
                        locale={locale}
                        size={13}
                        serif={false}
                        bold={isIncome ? 700 : 600}
                        showPositiveSign={isIncome}
                        color={isIncome ? colors.accent : undefined}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SourceChip({ src }: { src: 'voice' | 'apple-pay' | 'typed' | 'recurring' }) {
  if (src === 'voice') {
    return (
      <span style={{ ...chipStyles.base, background: colors.accentSoft, color: colors.accent }}>
        <Icon.mic color={colors.accent} size={11} />
        Voice
      </span>
    )
  }
  if (src === 'apple-pay') {
    return (
      <span style={{ ...chipStyles.base, background: '#E5E9EF', color: '#3B4F6B' }}>
        <Icon.list color="#3B4F6B" size={11} />
        Apple Pay
      </span>
    )
  }
  if (src === 'recurring') {
    return (
      <span style={{ ...chipStyles.base, background: '#F2E5D5', color: '#7A4A22' }}>
        <Icon.sparkle color="#7A4A22" size={11} />
        Recurring
      </span>
    )
  }
  return (
    <span style={{ ...chipStyles.base, background: colors.surface2, color: colors.ink2 }}>
      <Icon.list color={colors.ink2} size={11} />
      Typed
    </span>
  )
}

const chipStyles: Record<string, React.CSSProperties> = {
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 7px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: font.sans,
  },
}

const styles: Record<string, React.CSSProperties> = {
  content: { padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
  },
  serifTitle: {
    fontFamily: font.serif,
    fontSize: 28,
    fontWeight: 500,
    color: colors.ink,
    letterSpacing: -0.6,
  },
  subtitleLine: {
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    marginTop: 2,
  },
  filterTabs: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterTab: {
    padding: '6px 12px',
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    borderRadius: radius.md,
    cursor: 'pointer',
  },
  tableCard: {
    background: colors.card,
    borderRadius: radius.xl,
    border: `0.5px solid ${colors.line}`,
    overflow: 'hidden',
    fontFamily: font.sans,
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: '140px 1.6fr 1fr 0.9fr 1fr 0.7fr',
    padding: '12px 16px',
    fontSize: 10,
    fontWeight: 700,
    color: colors.ink3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    background: colors.surface,
    borderBottom: `0.5px solid ${colors.line}`,
  },
  tableBody: { maxHeight: '70vh', overflow: 'auto' },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '140px 1.6fr 1fr 0.9fr 1fr 0.7fr',
    padding: '12px 16px',
    fontSize: 13,
    alignItems: 'center',
    gap: 8,
  },
  dateCell: {
    color: colors.ink3,
    fontVariantNumeric: 'tabular-nums',
    fontSize: 12,
  },
  merchantCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  incomeChip: {
    fontSize: 11,
    fontWeight: 700,
    color: colors.accent,
    background: colors.accentSoft,
    padding: '2px 7px',
    borderRadius: 6,
  },
  empty: {
    padding: '40px 20px',
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink3,
    textAlign: 'center',
  },
}
