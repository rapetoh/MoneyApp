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

// Category tints — keyed by tint name. Mirrors mobile colors.categoryTints
// and the project tokens.jsx T.cat object. Fonts use `fg` for icons + chip
// text; backgrounds for chip pills + merchant logo fallbacks.
export const cat = {
  food: { bg: '#F3E7DC', fg: '#7A4A22' }, // peach
  transit: { bg: '#E1E6E0', fg: '#395435' }, // sage
  shopping: { bg: '#EEE6F0', fg: '#5C3F66' }, // lavender
  bills: { bg: '#E4E8EE', fg: '#334155' }, // sky-slate
  coffee: { bg: '#F2E8D5', fg: '#7A5A1C' }, // butter
  health: { bg: '#F4DDDD', fg: '#843C3C' }, // rose
  work: { bg: '#E6E7E0', fg: '#45463A' }, // olive
  other: { bg: '#ECE8E0', fg: '#5A5247' },
} as const

export type CategoryTint = keyof typeof cat

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

export const font = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Plus Jakarta Sans", system-ui, sans-serif',
  display: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif',
  serif: '"New York", "Iowan Old Style", "Georgia", "Times New Roman", serif',
  mono: '"SF Mono", "JetBrains Mono", "DM Mono", "Menlo", monospace',
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
