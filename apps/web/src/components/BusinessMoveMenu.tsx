'use client'
import { useEffect, useRef, useState } from 'react'
import type { Business } from '@voice-expense/shared'
import { colors, font } from '../lib/theme'
import { PERSONAL } from '../lib/businesses'
import { Icon } from './Icons'
import { BusinessMark, PersonalMark } from './BusinessMark'

/**
 * The bulk "Move to..." picker on Transactions (docs/businesses.md): Personal
 * and each business with its tile, which a native select cannot draw.
 * `value` is '' (nothing picked yet), PERSONAL, or a business id.
 */
export function BusinessMoveMenu({
  businesses,
  value,
  onChange,
}: {
  businesses: readonly Business[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const picked = businesses.find((b) => b.id === value)

  function pick(v: string) {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Move to business"
      >
        {picked ? (
          <BusinessMark business={picked} size={16} />
        ) : value === PERSONAL ? (
          <PersonalMark size={16} />
        ) : null}
        <span>{picked ? picked.name : value === PERSONAL ? 'Personal' : 'Move to…'}</span>
        <Icon.chev color={colors.ink3} size={10} />
      </button>
      {open && (
        <div role="listbox" aria-label="Move to business" style={styles.menu}>
          {[{ id: PERSONAL, name: 'Personal' } as const, ...businesses].map((b) => {
            const on = b.id === value
            return (
              <button
                key={b.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => pick(b.id)}
                style={{
                  ...styles.item,
                  background: on ? colors.accentSoft : 'transparent',
                  color: on ? colors.accent : colors.ink2,
                  fontWeight: on ? 700 : 600,
                }}
              >
                {'user_id' in b ? (
                  <BusinessMark business={b} size={20} />
                ) : (
                  <PersonalMark size={20} />
                )}
                <span style={styles.itemName}>{b.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    border: `0.5px solid ${colors.line}`,
    borderRadius: 999,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink2,
    background: colors.surface,
    cursor: 'pointer',
    maxWidth: 220,
    whiteSpace: 'nowrap',
  },
  // Same floating surface as the month picker's dropdown.
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
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
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    textAlign: 'left',
    padding: '7px 10px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontFamily: font.sans,
    fontSize: 13,
  },
  itemName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
