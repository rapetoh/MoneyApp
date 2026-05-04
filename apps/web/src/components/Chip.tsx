import { cat, font, type CategoryTint } from '../lib/theme'
import { tintFor } from '../lib/categories'

export function Chip({
  label,
  tint,
  categoryName,
  size = 'md',
}: {
  label: string
  tint?: CategoryTint
  categoryName?: string | null
  size?: 'sm' | 'md'
}) {
  const key = tint ?? tintFor(categoryName)
  const c = cat[key]
  const pad = size === 'sm' ? '3px 8px' : '5px 10px'
  const fs = size === 'sm' ? 11 : 12
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: c.bg,
        color: c.fg,
        padding: pad,
        borderRadius: 999,
        fontSize: fs,
        fontWeight: 600,
        letterSpacing: 0.1,
        fontFamily: font.sans,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}
