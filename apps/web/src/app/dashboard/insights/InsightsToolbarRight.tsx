'use client'
import { colors, font } from '../../../lib/theme'
import { Icon } from '../../../components/Icons'

/**
 * Right-slot for the Insights toolbar. Lives in its own client component
 * so the Generate report button's onClick doesn't break the parent
 * server component's serialization boundary.
 */
export function InsightsToolbarRight() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: font.sans,
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 8,
          border: `0.5px solid ${colors.line}`,
          color: colors.ink2,
        }}
      >
        Last 6 months
        <Icon.chev color={colors.ink3} size={10} />
      </div>
      <button
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: font.sans,
          background: colors.ink,
          color: '#fff',
          borderRadius: 8,
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={() => {
          if (typeof window !== 'undefined') window.print()
        }}
        title="Generate a printable report of this view"
      >
        <Icon.sparkle color="#fff" size={12} />
        Generate report
      </button>
    </div>
  )
}
