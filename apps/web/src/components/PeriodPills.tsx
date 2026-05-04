'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { colors, font } from '../lib/theme'

export type DashboardPeriod = 'week' | 'month' | 'quarter' | 'year'

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
]

export function PeriodPills({ selected }: { selected: DashboardPeriod }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pickPeriod(p: DashboardPeriod) {
    const params = new URLSearchParams(searchParams.toString())
    if (p === 'month') params.delete('period')
    else params.set('period', p)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div style={styles.group}>
      {PERIODS.map((p) => {
        const isActive = p.key === selected
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => pickPeriod(p.key)}
            style={{
              ...styles.pill,
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? colors.ink : colors.ink3,
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: 'flex',
    gap: 4,
    padding: 3,
    background: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  pill: {
    padding: '4px 10px',
    borderRadius: 6,
    fontFamily: font.sans,
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'background 120ms, color 120ms, box-shadow 120ms',
  },
}
