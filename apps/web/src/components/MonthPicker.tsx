'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { colors, font } from '../lib/theme'
import { currentMonthIso } from '../lib/monthIso'
import { Icon } from './Icons'

// Month picker for the Overview toolbar. Renders as "April 2026 ▼"; click
// opens a dropdown of the last 24 months. Also supports keyboard prev/next
// via the chevron buttons. Writes `?month=YYYY-MM` into the URL; the page
// reads that and anchors all lenses to the chosen month. Default = current
// month (no `?month` param).

export function MonthPicker({
  selected,
  locale,
  clearable = false,
  cleared = false,
  clearLabel = 'All time',
}: {
  /** Format: "YYYY-MM". Anchor month. */
  selected: string
  locale: string
  /**
   * When true, the picker has a "clear" affordance that removes ?month=
   * entirely. Used on Transactions where the default view is all-time.
   * The Overview never clears \u2014 it always anchors to a month.
   */
  clearable?: boolean
  /** When true, the label reads `clearLabel` (e.g. "All time") instead of
   *  the selected month \u2014 indicates the filter is currently off. */
  cleared?: boolean
  clearLabel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (e.target instanceof Node && wrapRef.current.contains(e.target)) return
      setOpen(false)
    }
    if (open) {
      window.addEventListener('mousedown', onClick)
      return () => window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function pickMonth(m: string) {
    const params = new URLSearchParams(searchParams.toString())
    // For non-clearable pickers (Overview), defaulting to "current month"
    // strips ?month= so URLs stay clean. Clearable pickers always write
    // ?month= when a specific month is chosen \u2014 the "clear" action is
    // the only path back to no-param.
    if (!clearable && m === currentMonthIso()) params.delete('month')
    else params.set('month', m)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    setOpen(false)
  }

  function clearMonth() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('month')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    setOpen(false)
  }

  function shift(months: number) {
    const [y, m] = selected.split('-').map(Number)
    const d = new Date(y, m - 1 + months, 1)
    pickMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const [yy, mm] = selected.split('-').map(Number)
  const selDate = new Date(yy, mm - 1, 1)
  const monthLabel = selDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
  const label = cleared ? clearLabel : monthLabel

  // Build the dropdown options: trailing 24 months, newest first.
  const options: Array<{ iso: string; label: string }> = []
  const now = new Date()
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({
      iso,
      label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
    })
  }

  return (
    <div ref={wrapRef} style={styles.wrap}>
      <button
        type="button"
        onClick={() => shift(-1)}
        style={styles.chevBtn}
        aria-label="Previous month"
      >
        <span style={{ display: 'inline-flex', transform: 'rotate(90deg)' }}>
          <Icon.chev color={colors.ink3} size={10} />
        </span>
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={styles.label}
        aria-expanded={open}
      >
        {label}
        <Icon.chev color={colors.ink3} size={10} />
      </button>
      <button
        type="button"
        onClick={() => shift(1)}
        style={styles.chevBtn}
        aria-label="Next month"
      >
        <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}>
          <Icon.chev color={colors.ink3} size={10} />
        </span>
      </button>
      {open && (
        <div style={styles.menu} role="menu">
          {clearable && (
            <button
              type="button"
              onClick={clearMonth}
              style={{
                ...styles.menuItem,
                background: cleared ? colors.accentSoft : 'transparent',
                color: cleared ? colors.accent : colors.ink2,
                fontWeight: cleared ? 700 : 600,
                borderBottom: `0.5px solid ${colors.line}`,
                marginBottom: 4,
                paddingBottom: 8,
              }}
            >
              {clearLabel}
            </button>
          )}
          {options.map((o) => {
            const on = !cleared && o.iso === selected
            return (
              <button
                key={o.iso}
                type="button"
                onClick={() => pickMonth(o.iso)}
                style={{
                  ...styles.menuItem,
                  background: on ? colors.accentSoft : 'transparent',
                  color: on ? colors.accent : colors.ink2,
                  fontWeight: on ? 700 : 500,
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    background: 'rgba(255,255,255,0.7)',
    border: `0.5px solid ${colors.line}`,
    borderRadius: 8,
    padding: 2,
    fontFamily: font.sans,
  },
  chevBtn: {
    width: 26,
    height: 28,
    borderRadius: 6,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    padding: '4px 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink2,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: 200,
    maxHeight: 320,
    overflowY: 'auto',
    background: '#fff',
    border: `0.5px solid ${colors.line}`,
    borderRadius: 10,
    boxShadow: '0 12px 40px rgba(40,36,28,0.10)',
    padding: 4,
    zIndex: 20,
  },
  menuItem: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.ink2,
  },
}
