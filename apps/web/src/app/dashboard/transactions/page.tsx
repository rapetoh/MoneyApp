'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { snapshotFx } from '@voice-expense/shared'
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
  currency_code: string
  merchant: string | null
  merchant_domain: string | null
  note: string | null
  category_id: string | null
  payment_method: string | null
  source: string | null
  transacted_at: string
  is_recurring?: boolean
  version?: number | null
  fx_rate_to_profile?: number | null
  amount_in_profile_currency?: number | null
}
type Cat = { id: string; name: string; color?: string | null }

const PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Not specified' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'debit_card', label: 'Debit card' },
  { value: 'digital_wallet', label: 'Digital wallet' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]

const NEW_CATEGORY = '__new__'

/** transacted_at ISO → value for a datetime-local input, in local time. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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

  // --- Entry form (create + edit). `editingId` null = new transaction.
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fAmount, setFAmount] = useState('')
  const [fDirection, setFDirection] = useState<'debit' | 'credit'>('debit')
  const [fMerchant, setFMerchant] = useState('')
  const [fNote, setFNote] = useState('')
  const [fCategoryId, setFCategoryId] = useState('')
  const [fNewCatName, setFNewCatName] = useState('')
  const [fPayment, setFPayment] = useState('')
  const [fDate, setFDate] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Re-sync the in-page search when the toolbar pushes a new ?q= via the
  // global search field. Without this, navigating from another tab to
  // /dashboard/transactions?q=foo wouldn't update the input.
  useEffect(() => {
    setSearch(initialQ)
  }, [initialQ])

  useEffect(() => {
    setFilter(filterParam)
  }, [filterParam])

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  function openNewForm() {
    setEditingId(null)
    setFAmount('')
    setFDirection('debit')
    setFMerchant('')
    setFNote('')
    setFCategoryId('')
    setFNewCatName('')
    setFPayment('')
    setFDate(toLocalInputValue(new Date().toISOString()))
    setFormError(null)
    setShowForm(true)
  }

  function openEditForm(t: Txn) {
    setEditingId(t.id)
    setFAmount(String(t.amount))
    setFDirection(t.direction)
    setFMerchant(t.merchant ?? '')
    setFNote(t.note ?? '')
    setFCategoryId(t.category_id ?? '')
    setFNewCatName('')
    setFPayment(t.payment_method ?? '')
    setFDate(toLocalInputValue(t.transacted_at))
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  /** Resolves the form's category selection to an id — creating the
   *  category first when "+ New category" was picked (CROSS §1.3). */
  async function resolveCategoryId(userId: string): Promise<{ id: string | null; error: string | null }> {
    if (fCategoryId !== NEW_CATEGORY) return { id: fCategoryId || null, error: null }
    const name = fNewCatName.trim()
    if (!name) return { id: null, error: 'Enter a name for the new category' }
    const normalized = name.toLowerCase()
    // Reuse an existing category on name collision instead of failing
    // the UNIQUE(user_id, name_normalized) constraint.
    const existing = categories.find((c) => c.name.trim().toLowerCase() === normalized)
    if (existing) return { id: existing.id, error: null }
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_id: userId, name, name_normalized: normalized })
      .select('id')
      .single()
    if (error || !data) return { id: null, error: error?.message ?? 'Could not create category' }
    return { id: data.id, error: null }
  }

  async function handleFormSave() {
    const parsed = parseFloat(fAmount.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) {
      setFormError('Enter a valid amount')
      return
    }
    setSaving(true)
    setFormError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      setFormError('Not signed in')
      return
    }
    const cat = await resolveCategoryId(user.id)
    if (cat.error) {
      setSaving(false)
      setFormError(cat.error)
      return
    }
    const transactedAt = fDate ? new Date(fDate).toISOString() : new Date().toISOString()
    const shared = {
      amount: parsed,
      direction: fDirection,
      merchant: fMerchant.trim() || null,
      note: fNote.trim() || null,
      category_id: cat.id,
      payment_method: fPayment || null,
      transacted_at: transactedAt,
    }

    if (editingId) {
      const row = transactions.find((t) => t.id === editingId)
      // Amount edits recompute the FX snapshot with the row's stored
      // rate (dated to transacted_at, which doesn't change) — mirrors
      // the mobile editTransaction path. Rows awaiting backfill stay
      // null and the mobile backfill sweep picks them up.
      const fxPatch =
        row?.fx_rate_to_profile != null
          ? { amount_in_profile_currency: Math.round(parsed * row.fx_rate_to_profile * 100) / 100 }
          : {}
      const { error } = await supabase
        .from('transactions')
        .update({
          ...shared,
          ...fxPatch,
          version: (row?.version ?? 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId)
        .eq('user_id', user.id)
      setSaving(false)
      if (error) {
        setFormError(error.message)
        return
      }
    } else {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const currency = profile?.currency_code ?? 'USD'
      // Same-currency short-circuits to rate 1.0 without a network
      // call; the manual web form always enters amounts in the
      // profile currency, so this never blocks the save.
      const fx = await snapshotFx(transactedAt, currency, currency, parsed)
      const { error } = await supabase.from('transactions').insert({
        id,
        user_id: user.id,
        ...shared,
        currency_code: currency,
        merchant_domain: null,
        source: 'manual',
        amount_in_profile_currency: fx?.amount_in_profile_currency ?? null,
        fx_rate_to_profile: fx?.fx_rate_to_profile ?? null,
        fx_rate_date: fx?.fx_rate_date ?? null,
        client_id: id,
        client_created_at: now,
        version: 1,
        is_deleted: false,
      })
      setSaving(false)
      if (error) {
        setFormError(error.message)
        return
      }
    }
    closeForm()
    await load()
  }

  async function handleDelete() {
    if (!editingId) return
    if (!window.confirm('Delete this transaction? It can be recovered for 30 days.')) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      return
    }
    const row = transactions.find((t) => t.id === editingId)
    const { error } = await supabase
      .from('transactions')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        version: (row?.version ?? 1) + 1,
      })
      .eq('id', editingId)
      .eq('user_id', user.id)
    setSaving(false)
    if (error) {
      setFormError(error.message)
      return
    }
    closeForm()
    await load()
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
            <button
              type="button"
              onClick={openNewForm}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: colors.accent,
                color: '#fff',
                borderRadius: radius.md,
                border: 'none',
                fontFamily: font.sans,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon.plus color="#fff" size={12} />
              Add transaction
            </button>
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

        {showForm && (
          <div style={styles.formCard}>
            <div style={styles.formTitle}>
              {editingId ? 'Edit transaction' : 'New transaction'}
            </div>
            {formError && <div style={styles.formError}>{formError}</div>}
            <div style={styles.formRow}>
              <div style={styles.field}>
                <label style={styles.label}>Amount ({profile?.currency_code ?? 'USD'})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fAmount}
                  onChange={(e) => setFAmount(e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                  autoFocus
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Type</label>
                <select
                  value={fDirection}
                  onChange={(e) => setFDirection(e.target.value as 'debit' | 'credit')}
                  style={styles.select}
                >
                  <option value="debit">Expense</option>
                  <option value="credit">Income</option>
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Date</label>
                <input
                  type="datetime-local"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}>
                <label style={styles.label}>Merchant</label>
                <input
                  type="text"
                  value={fMerchant}
                  onChange={(e) => setFMerchant(e.target.value)}
                  placeholder="Where was it?"
                  style={styles.input}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Category</label>
                <select
                  value={fCategoryId}
                  onChange={(e) => setFCategoryId(e.target.value)}
                  style={styles.select}
                >
                  <option value="">None</option>
                  {categories
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  <option value={NEW_CATEGORY}>+ New category…</option>
                </select>
              </div>
              {fCategoryId === NEW_CATEGORY && (
                <div style={styles.field}>
                  <label style={styles.label}>New category name</label>
                  <input
                    type="text"
                    value={fNewCatName}
                    onChange={(e) => setFNewCatName(e.target.value)}
                    placeholder="e.g. Hobbies"
                    style={styles.input}
                  />
                </div>
              )}
              <div style={styles.field}>
                <label style={styles.label}>Payment method</label>
                <select
                  value={fPayment}
                  onChange={(e) => setFPayment(e.target.value)}
                  style={styles.select}
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={styles.formRow}>
              <div style={styles.field}>
                <label style={styles.label}>Note</label>
                <input
                  type="text"
                  value={fNote}
                  onChange={(e) => setFNote(e.target.value)}
                  placeholder="Optional"
                  style={styles.input}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <div>
                {editingId && (
                  <button type="button" onClick={handleDelete} disabled={saving} style={styles.deleteBtn}>
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={closeForm} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="button" onClick={handleFormSave} disabled={saving} style={styles.saveBtn}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

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
                    onClick={() => openEditForm(t)}
                    title="Click to edit"
                    style={{
                      ...styles.tableRow,
                      cursor: 'pointer',
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
  formCard: {
    background: colors.card,
    borderRadius: radius.xl,
    border: `0.5px solid ${colors.line}`,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    fontFamily: font.sans,
  },
  formTitle: { fontFamily: font.sans, fontWeight: 700, fontSize: 14, color: colors.ink },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field: { flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontFamily: font.sans, fontSize: 11, color: colors.ink3, fontWeight: 600 },
  input: {
    padding: '8px 10px',
    borderRadius: radius.md,
    border: `0.5px solid ${colors.line}`,
    fontFamily: font.sans,
    fontSize: 13,
    background: colors.surface,
    color: colors.ink,
  },
  select: {
    padding: '8px 10px',
    borderRadius: radius.md,
    border: `0.5px solid ${colors.line}`,
    fontFamily: font.sans,
    fontSize: 13,
    background: colors.surface,
    color: colors.ink,
  },
  cancelBtn: {
    padding: '7px 14px',
    borderRadius: radius.md,
    border: `0.5px solid ${colors.line}`,
    background: 'transparent',
    color: colors.ink2,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '7px 14px',
    borderRadius: radius.md,
    border: 'none',
    background: colors.ink,
    color: '#fff',
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '7px 14px',
    borderRadius: radius.md,
    border: '0.5px solid #A94646',
    background: 'transparent',
    color: '#A94646',
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  formError: {
    fontFamily: font.sans,
    fontSize: 12,
    color: '#A94646',
    background: '#F7E7E7',
    padding: '6px 10px',
    borderRadius: radius.md,
  },
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
