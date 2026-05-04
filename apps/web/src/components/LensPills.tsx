'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { colors, font } from '../lib/theme'
import type { LensKey } from './lenses/types'

const LENSES: Array<{ k: LensKey; label: string }> = [
  { k: 'mindmap', label: 'Mind map' },
  { k: 'flow', label: 'Flow' },
  { k: 'calendar', label: 'Calendar' },
  { k: 'treemap', label: 'Treemap' },
  { k: 'cashflow', label: 'Cashflow' },
  { k: 'matrix', label: 'Matrix' },
]

export function LensPills({ active }: { active: LensKey }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pick(k: LensKey) {
    const params = new URLSearchParams(searchParams.toString())
    if (k === 'mindmap') params.delete('lens')
    else params.set('lens', k)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div style={styles.group}>
      {LENSES.map((l) => {
        const on = l.k === active
        return (
          <button
            key={l.k}
            type="button"
            onClick={() => pick(l.k)}
            style={{
              ...styles.pill,
              background: on ? '#fff' : 'transparent',
              color: on ? colors.ink : colors.ink3,
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            <Glyph kind={l.k} on={on} />
            {l.label}
          </button>
        )
      })}
    </div>
  )
}

function Glyph({ kind, on }: { kind: LensKey; on: boolean }) {
  const c = on ? colors.accent : colors.ink4
  const w = 14
  const h = 14
  if (kind === 'mindmap') {
    return (
      <svg width={w} height={h} viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="2" fill={c} />
        <line x1="7" y1="7" x2="2" y2="3" stroke={c} strokeWidth="1.2" />
        <line x1="7" y1="7" x2="12" y2="3" stroke={c} strokeWidth="1.2" />
        <line x1="7" y1="7" x2="2" y2="11" stroke={c} strokeWidth="1.2" />
        <line x1="7" y1="7" x2="12" y2="11" stroke={c} strokeWidth="1.2" />
        <circle cx="2" cy="3" r="1" fill={c} />
        <circle cx="12" cy="3" r="1" fill={c} />
        <circle cx="2" cy="11" r="1" fill={c} />
        <circle cx="12" cy="11" r="1" fill={c} />
      </svg>
    )
  }
  if (kind === 'flow') {
    return (
      <svg width={w} height={h} viewBox="0 0 14 14">
        <path
          d="M1,3 C 5,3 5,5 9,5 L13,5 M1,7 C 5,7 5,7 9,7 L13,7 M1,11 C 5,11 5,9 9,9 L13,9"
          stroke={c}
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (kind === 'calendar') {
    return (
      <svg width={w} height={h} viewBox="0 0 14 14">
        <rect x="1" y="3" width="12" height="10" rx="1.5" fill="none" stroke={c} strokeWidth="1.2" />
        <line x1="1" y1="6" x2="13" y2="6" stroke={c} strokeWidth="1.2" />
        <circle cx="4" cy="9" r="0.8" fill={c} />
        <circle cx="7" cy="9" r="0.8" fill={c} />
        <circle cx="10" cy="9" r="0.8" fill={c} />
      </svg>
    )
  }
  if (kind === 'treemap') {
    return (
      <svg width={w} height={h} viewBox="0 0 14 14">
        <rect x="1" y="1" width="7" height="8" fill="none" stroke={c} strokeWidth="1.2" />
        <rect x="9" y="1" width="4" height="5" fill="none" stroke={c} strokeWidth="1.2" />
        <rect x="9" y="7" width="4" height="6" fill="none" stroke={c} strokeWidth="1.2" />
        <rect x="1" y="10" width="7" height="3" fill="none" stroke={c} strokeWidth="1.2" />
      </svg>
    )
  }
  if (kind === 'cashflow') {
    return (
      <svg width={w} height={h} viewBox="0 0 14 14">
        <polyline
          points="1,10 4,7 7,9 10,4 13,6"
          stroke={c}
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  // matrix
  return (
    <svg width={w} height={h} viewBox="0 0 14 14">
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((cx) => (
          <rect
            key={`${r}-${cx}`}
            x={1 + cx * 3}
            y={2 + r * 3}
            width="2.4"
            height="2.4"
            fill={c}
            opacity={0.3 + 0.25 * ((r + cx) % 3)}
          />
        )),
      )}
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: 'flex',
    gap: 3,
    padding: 3,
    background: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
  },
  pill: {
    padding: '7px 12px',
    borderRadius: 8,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background 120ms, color 120ms, box-shadow 120ms',
  },
}
