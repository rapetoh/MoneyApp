// Murmur desktop palette — mirrors apps/mobile/src/theme/colors.ts and the
// project tokens at docs/money-app/project/tokens.jsx. Single source of truth
// for the web/desktop UI. Brand rule: sage is the only saturated accent;
// everything else is a warm neutral. Never blue.

export const colors = {
  // Canvas
  bg: '#FBFAF7',
  background: '#F4F1EA', // bgDesk — recessed desktop canvas
  card: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#F5F2EB',

  // Ink scale
  ink: '#1B1915',
  ink2: '#3A3630',
  ink3: '#6C675E',
  ink4: '#9C9589',

  // Legacy aliases — keep until the rest of the codebase migrates
  text: '#1B1915',
  textSecondary: '#3A3630',
  textMuted: '#6C675E',

  // Accent — deep sage
  primary: '#3F5A3E',
  primaryLight: '#E8EDE3',
  accent: '#3F5A3E',
  accentSoft: '#E8EDE3',

  // Status
  income: '#4A7C59',
  incomeLight: '#DCE8D9',
  expense: '#1B1915',
  destructive: '#B44A3F',
  destructiveLight: '#F3DAD4',
  warn: '#B07B2A',
  warnSoft: '#F2E8D5',

  // Hairlines + shadows
  line: 'rgba(40,36,28,0.08)',
  lineHard: 'rgba(40,36,28,0.14)',
  border: 'rgba(40,36,28,0.08)',
  shadow: 'rgba(40,36,28,0.08)',

  white: '#FFFFFF',
} as const

// The hard-coded `cat` tint table (keyed by a made-up tint name like
// "food"/"coffee") and the name-regex `tintFor` heuristic that chose one
// of its 8 buckets used to live here — deleted (fix-plan 4.4).
// `categories.color` is the single source of truth for a category's
// color; every chart/chip derives its tint from that hex via
// `categoryPalette()` in `@voice-expense/shared` instead, so renaming a
// category (or a merchant name coincidentally matching a bucket regex)
// can no longer change what color it renders in.

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 18,
  full: 9999,
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
}

// `--font-plus-jakarta-sans`/`--font-dm-mono` are self-hosted via
// next/font (fix-plan 4.5, `app/layout.tsx`) — the literal "Plus Jakarta
// Sans"/"DM Mono" names below would silently miss next/font's
// hash-scoped @font-face and could resolve to a same-named font the
// OS happens to have installed instead.
export const font = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", var(--font-plus-jakarta-sans), system-ui, sans-serif',
  display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif',
  serif: '"New York", "Iowan Old Style", "Georgia", "Times New Roman", serif',
  mono: '"SF Mono", "JetBrains Mono", var(--font-dm-mono), "Menlo", monospace',
}

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
}
