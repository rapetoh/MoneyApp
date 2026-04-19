// Murmur palette — based on docs/Claude Code Design.md §3 (Visual system).
// Warm off-whites, deep sage accent, ink 1–4 grayscale, harmonious category pastels.
// Legacy semantic names (primary, background, card, text, etc.) are preserved so
// existing components adopt the new palette without a full rewrite.

export const Colors = {
  // Canvas
  background: '#FBFAF7', // warm off-white (mobile canvas)
  bgDesk: '#F4F1EA', // recessed desktop canvas
  card: '#FFFFFF', // surface (cards)
  surface: '#FFFFFF',
  surface2: '#F5F2EB', // recessed surfaces, bar tracks

  // Ink / text
  ink: '#1B1915', // near-black, warm — primary text
  ink2: '#3A3630', // body
  ink3: '#6C675E', // secondary
  ink4: '#9C9589', // tertiary / hints

  // Accent (deep sage)
  primary: '#3F5A3E', // semantic alias for accent — drives buttons, active tabs, FAB
  primaryLight: '#E8EDE3',
  accent: '#3F5A3E',
  accentSoft: '#E8EDE3',

  // Semantic status
  income: '#4A7C59', // sage-tinted green (was bright #22C55E)
  incomeLight: '#DCE8D9',
  expense: '#1B1915',
  expenseLight: '#F5F2EB',
  destructive: '#B44A3F', // warm rose-brick (was bright #EF4444)
  destructiveLight: '#F3DAD4',

  // Legacy text aliases — point at ink scale
  text: '#1B1915',
  textSecondary: '#3A3630',
  textMuted: '#6C675E',

  // Hairline dividers & shadow
  line: 'rgba(40,36,28,0.08)', // canonical hairline
  border: 'rgba(40,36,28,0.08)',
  shadow: '#00000014',

  // Low-confidence / unclear marker (rose)
  unclear: '#C8685E',
  unclearSoft: '#F3DAD4',

  // Tab bar
  white: '#FFFFFF',
  tabBar: '#FFFFFF',
  tabBarBorder: 'rgba(40,36,28,0.06)',

  // Category tints — harmonious pastels per design doc §3 (peach, sage, lavender,
  // butter, rose, olive). Low-saturation so they carry meaning without competing
  // with content.
  categoryTints: {
    peach: { bg: '#F6E0D1', ink: '#8C4A2A' },
    sage: { bg: '#DDE5D5', ink: '#3F5A3E' },
    lavender: { bg: '#E2DDEA', ink: '#5A4E7A' },
    butter: { bg: '#F3E6C2', ink: '#8A6F1F' },
    rose: { bg: '#F1D9DB', ink: '#8E424C' },
    olive: { bg: '#D9DDC4', ink: '#5A5F34' },
  },

  // Deterministic merchant-avatar fallback palette — muted, harmonious.
  // Used when MerchantAvatar has no domain or logo fetch fails. This is a
  // product-critical feature (see feedback memory: don't regress merchant logos).
  avatarColors: [
    '#8C4A2A', // peach-deep
    '#3F5A3E', // sage
    '#5A4E7A', // lavender-deep
    '#8A6F1F', // butter-deep
    '#8E424C', // rose-deep
    '#5A5F34', // olive-deep
    '#4A6B74', // dusty teal
    '#6B4E3D', // warm taupe
  ],
} as const
