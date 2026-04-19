export { Colors } from './colors'
export { Typography, Text } from './typography'

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const

// Shape language (design §3): 28–34 for cards, 14–22 for rows, 999 for pills.
// The tokens below reflect that vocabulary. The legacy sm/md/lg/xl are kept
// for row-scale corners; `card` and `cardLarge` are the new card-scale tokens.
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22, // row-scale upper bound
  card: 28, // new — default card radius per design
  cardLarge: 34, // new — hero card radius per design
  full: 999,
} as const

// Hairline — the only divider the design calls for. Use this instead of
// StyleSheet.hairlineWidth + Colors.border when you want the canonical look.
export const Hairline = {
  width: 1,
  color: 'rgba(40,36,28,0.08)',
} as const
