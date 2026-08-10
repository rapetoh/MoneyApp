import { colors, font } from '../lib/theme'
import { categoryPalette } from '@voice-expense/shared'

// `categories.color` is the single source of truth for a category's
// color (fix-plan 4.4) — this chip derives its bg/fg from the category's
// own hex via `categoryPalette` instead of a name-regex `tintFor` guess,
// so it can never render a different color than the same category's row
// or chart elsewhere. `categoryColor` unset (no category, e.g. an
// uncategorized income row) falls back to a neutral ink tint.
export function Chip({
  label,
  categoryColor,
  size = 'md',
}: {
  label: string
  categoryColor?: string | null
  size?: 'sm' | 'md'
}) {
  const { bg, fg } = categoryColor ? categoryPalette(categoryColor) : { bg: colors.surface2, fg: colors.ink3 }
  const pad = size === 'sm' ? '3px 8px' : '5px 10px'
  const fs = size === 'sm' ? 11 : 12
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: bg,
        color: fg,
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
