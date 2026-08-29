'use client'
import { useEffect, useState } from 'react'
import { colors, font, radius } from '../lib/theme'
import type { RecurringFrequency, RecurringRule } from '@voice-expense/shared'
import { civilDateTimeToInstant, localDay } from '@voice-expense/shared'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD', 'XAF', 'NGN', 'GHS']

const FREQUENCIES: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
]

export interface RecurringRuleFormValues {
  name: string | null
  amount: number
  currency_code: string
  category_id: string | null
  direction: 'debit' | 'credit'
  frequency: RecurringFrequency
  interval: number
  /** Noon-anchored instant for the chosen civil date, in `tz`. */
  starts_at: string
  ends_at: string | null
}

interface Cat {
  id: string
  name: string
}

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  initial?: RecurringRule | null
  categories: Cat[]
  defaultCurrency: string
  tz: string
  onSave: (values: RecurringRuleFormValues) => Promise<boolean>
  onClose: () => void
  /** Present only in edit mode — "cancelled ... without touching a
   *  transaction" (fix-plan 3.3's "Done when"). Omit to hide the action
   *  (the create form has nothing to delete yet). */
  onDelete?: () => void
}

/**
 * The one create/edit form for a recurring rule (fix-plan 3.3) on web —
 * the mobile-side twin of `apps/mobile/src/components/RecurringRuleEditor
 * .tsx`. Web's `<input type="date">` gives a real date picker natively,
 * so unlike mobile there's no free-text date parsing here — the same
 * field list (name, amount, currency, category, direction, frequency,
 * interval, next date, `ends_at` as "Cancel from") the plan specifies.
 */
export function RecurringRuleModal({
  open,
  mode,
  initial,
  categories,
  defaultCurrency,
  tz,
  onSave,
  onClose,
  onDelete,
}: Props) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(defaultCurrency)
  const [categoryId, setCategoryId] = useState('')
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [interval, setInterval_] = useState(1)
  const [nextDate, setNextDate] = useState('')
  const [hasEndDate, setHasEndDate] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFormError(null)
    if (mode === 'edit' && initial) {
      setName(initial.name ?? '')
      setAmount(String(initial.amount))
      setCurrency(initial.currency_code || defaultCurrency)
      setCategoryId(initial.category_id ?? '')
      setDirection(initial.direction)
      setFrequency(initial.frequency)
      setInterval_(initial.interval || 1)
      setNextDate(localDay(initial.starts_at, tz))
      setHasEndDate(!!initial.ends_at)
      setEndDate(initial.ends_at ? localDay(initial.ends_at, tz) : '')
    } else {
      setName('')
      setAmount('')
      setCurrency(defaultCurrency)
      setCategoryId('')
      setDirection('debit')
      setFrequency('monthly')
      setInterval_(1)
      setNextDate(localDay(new Date().toISOString(), tz))
      setHasEndDate(false)
      setEndDate('')
    }
  }, [open, mode, initial, defaultCurrency, tz])

  if (!open) return null

  async function handleSave() {
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Enter an amount greater than 0.')
      return
    }
    const nextMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextDate)
    if (!nextMatch) {
      setFormError('Pick a next-charge date.')
      return
    }
    let endsAtInstant: string | null = null
    if (hasEndDate) {
      const endMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endDate)
      if (!endMatch) {
        setFormError('Pick an end date, or turn the toggle off.')
        return
      }
      endsAtInstant = civilDateTimeToInstant(
        Number(endMatch[1]),
        Number(endMatch[2]),
        Number(endMatch[3]),
        12,
        0,
        0,
        tz,
      )
    }

    setSaving(true)
    setFormError(null)
    const ok = await onSave({
      name: name.trim() || null,
      amount: Math.round(parsedAmount * 100) / 100,
      currency_code: currency,
      category_id: categoryId || null,
      direction,
      frequency,
      interval: Math.max(1, Math.min(99, Math.round(interval) || 1)),
      starts_at: civilDateTimeToInstant(
        Number(nextMatch[1]),
        Number(nextMatch[2]),
        Number(nextMatch[3]),
        12,
        0,
        0,
        tz,
      ),
      ends_at: endsAtInstant,
    })
    setSaving(false)
    if (ok) {
      onClose()
    } else {
      setFormError("Couldn't save this rule - try again.")
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>{mode === 'edit' ? 'Edit recurring rule' : 'New recurring rule'}</div>
          <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close">
            ×
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.directionRow}>
            <button
              type="button"
              onClick={() => setDirection('debit')}
              style={{ ...styles.directionBtn, ...(direction === 'debit' ? styles.directionBtnActive : {}) }}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setDirection('credit')}
              style={{
                ...styles.directionBtn,
                ...(direction === 'credit' ? styles.directionBtnActiveIncome : {}),
              }}
            >
              Income
            </button>
          </div>

          <div style={styles.row2}>
            <Field label="Amount">
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={styles.input}
                placeholder="0.00"
              />
            </Field>
            <Field label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={styles.input}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              placeholder="e.g. Netflix"
            />
          </Field>

          <Field label="Category">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={styles.input}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div style={styles.row2}>
            <Field label="Frequency">
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                style={styles.input}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Repeat every" hint="2 = every other cycle">
              <input
                type="number"
                min={1}
                max={99}
                value={interval}
                onChange={(e) => setInterval_(Number(e.target.value) || 1)}
                style={styles.input}
              />
            </Field>
          </div>

          <Field label="Next charge">
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              style={styles.input}
            />
          </Field>

          <label style={styles.endToggleRow}>
            <input type="checkbox" checked={hasEndDate} onChange={(e) => setHasEndDate(e.target.checked)} />
            <span style={styles.endToggleLabel}>This has an end date</span>
          </label>
          {hasEndDate && (
            <Field label="Cancel from">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={styles.input}
              />
            </Field>
          )}

          {formError && <div style={styles.errorText}>{formError}</div>}
        </div>

        <div style={styles.footer}>
          {mode === 'edit' && onDelete && (
            <button type="button" onClick={onDelete} style={styles.deleteBtn} disabled={saving}>
              Cancel this rule
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={saving}>
            Close
          </button>
          <button type="button" onClick={handleSave} style={styles.saveBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
      {hint && <div style={styles.fieldHint}>{hint}</div>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(27,25,21,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  modal: {
    width: 420,
    maxWidth: '100%',
    maxHeight: '88vh',
    overflow: 'auto',
    background: colors.card,
    borderRadius: radius.xl,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    fontFamily: font.sans,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: `0.5px solid ${colors.line}`,
  },
  title: { fontFamily: font.serif, fontSize: 18, fontWeight: 600, color: colors.ink },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    border: 'none',
    background: colors.surface,
    color: colors.ink3,
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
  },
  body: { padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  directionRow: {
    display: 'flex',
    gap: 4,
    background: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    border: `0.5px solid ${colors.line}`,
  },
  directionBtn: {
    flex: 1,
    padding: '8px 0',
    borderRadius: radius.sm,
    border: 'none',
    background: 'transparent',
    color: colors.ink3,
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  directionBtnActive: { background: colors.ink, color: '#fff' },
  directionBtnActiveIncome: { background: colors.income, color: '#fff' },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    color: colors.ink3,
  },
  fieldHint: { fontSize: 11, color: colors.ink4 },
  input: {
    padding: '9px 12px',
    borderRadius: radius.md,
    border: `0.5px solid ${colors.line}`,
    background: colors.surface,
    fontFamily: font.sans,
    fontSize: 14,
    color: colors.ink,
  },
  endToggleRow: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' },
  endToggleLabel: { fontSize: 13, fontWeight: 600, color: colors.ink },
  errorText: { fontSize: 12, color: colors.destructive, fontWeight: 600 },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '14px 20px',
    borderTop: `0.5px solid ${colors.line}`,
  },
  cancelBtn: {
    padding: '8px 14px',
    borderRadius: radius.md,
    border: `0.5px solid ${colors.line}`,
    background: 'transparent',
    color: colors.ink3,
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 14px',
    borderRadius: radius.md,
    border: 'none',
    background: 'transparent',
    color: colors.destructive,
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '8px 16px',
    borderRadius: radius.md,
    border: 'none',
    background: colors.ink,
    color: '#fff',
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
