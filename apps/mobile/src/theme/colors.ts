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

  // The hard-coded `categoryTints` table (a name-keyed guess independent
  // of the category's own `color`) and the unwired `avatarColors`
  // palette that was meant to fix `MerchantAvatar`'s fallback-tile
  // contrast used to live here — deleted (fix-plan 4.4). `categories.
  // color` is the single source of truth for a category's color, and
  // `avatarColors` is now `merchantColor`'s own palette in
  // `@voice-expense/shared`'s `color.ts` (both apps import from there),
  // so there is exactly one copy of each instead of one declared-but-
  // unused and one hard-coded table that could disagree with it.
} as const
