// Murmur desktop/web palette — mirrors apps/mobile/src/theme/colors.ts.
// See docs/DESIGN.md §3 (Visual system).
export const colors = {
  background: '#F4F1EA', // bgDesk — recessed desktop canvas
  card: '#FFFFFF',
  surface2: '#F5F2EB',
  primary: '#3F5A3E', // deep sage — never a brand-y fintech blue
  primaryLight: '#E8EDE3',
  accent: '#3F5A3E',
  accentSoft: '#E8EDE3',
  text: '#1B1915',
  textSecondary: '#3A3630',
  textMuted: '#6C675E',
  border: 'rgba(40,36,28,0.08)',
  line: 'rgba(40,36,28,0.08)',
  income: '#4A7C59',
  incomeLight: '#DCE8D9',
  expense: '#1B1915',
  destructive: '#B44A3F',
  destructiveLight: '#F3DAD4',
  shadow: 'rgba(40,36,28,0.08)',
  white: '#FFFFFF',
  sidebar: '#1F2620', // warm near-black sidebar (tuned for sage primary)
  sidebarHover: '#2C3530',
  sidebarText: '#D4D1C7',
  sidebarActive: '#3F5A3E',
}

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
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
  sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  // Serif — used for big money amounts (see DESIGN.md §3). System 'New York' on macOS,
  // Georgia fallback everywhere else. No web font to load.
  serif: "'New York', 'Georgia', 'Times New Roman', serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
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
