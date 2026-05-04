import type { ReactNode } from 'react'
import { colors, radius } from '../lib/theme'

export function Card({
  title,
  right,
  children,
  dark = false,
  padding = '16px 18px',
  style,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  dark?: boolean
  padding?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        background: dark ? colors.ink : colors.card,
        borderRadius: radius.xl,
        padding,
        border: dark ? 'none' : `0.5px solid ${colors.line}`,
        boxShadow: dark ? 'none' : `0 1px 0 rgba(0,0,0,0.02)`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...style,
      }}
    >
      {(title || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          {title && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: dark ? 'rgba(255,255,255,0.6)' : colors.ink3,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {title}
            </div>
          )}
          {right}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  )
}
