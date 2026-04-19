// Murmur type system — see docs/Claude Code Design.md §3.
//
// Three families:
//   - sans  (PlusJakartaSans, loaded via expo-font) — UI text, labels, buttons
//   - serif (New York on iOS, Georgia/serif on Android) — money amounts
//   - mono  (DMMono, loaded via expo-font) — small numeric chips, dev-only data
//
// Big money amounts are set in serif on purpose: "money is personal, not a
// spreadsheet." The mono family is intentionally NOT the hero for amounts
// anymore — keep it for tiny numeric chips (see Chip / MerchantAvatar use).

import { Platform } from 'react-native'
import { Colors } from './colors'

const serifFamily = Platform.select({
  ios: 'New York',
  android: 'serif',
  default: 'serif',
})

export const Typography = {
  fontFamily: {
    sans: 'PlusJakartaSans',
    sansBold: 'PlusJakartaSans-Bold',
    sansSemiBold: 'PlusJakartaSans-SemiBold',
    // Serif — system-provided; no asset to load.
    serif: serifFamily,
    serifBold: serifFamily,
    // Mono retained for small numeric chips, not hero amounts.
    mono: 'DMMonoRegular',
    monoBold: 'DMMonoBold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
    '4xl': 48,
    hero: 92,
  },
  lineHeight: {
    tight: 1.05,
    snug: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const

// Text role presets — use these instead of hand-assembling styles.
export const Text = {
  navTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
  h1: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 24,
    color: Colors.ink,
  },
  h2: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.ink,
  },
  // Serif display — used for screen-level headlines like "Today", "Speak it."
  displaySerif: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 34,
    fontWeight: '600' as const,
    color: Colors.ink,
    letterSpacing: -0.5,
  },
  body: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  bodyRegular: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.ink3,
  },
  label: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink3,
  },
  hint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.ink4,
  },
  button: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.white,
  },
  buttonSecondary: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.ink3,
  },
  // Money — SERIF. Previously mono; redesign upgrades amounts to serif for warmth.
  amount: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.ink,
    letterSpacing: -0.2,
  },
  amountLarge: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 48,
    fontWeight: '600' as const,
    color: Colors.ink,
    letterSpacing: -0.8,
  },
  // Listening-screen hero amount (see Phase C — Capture flow polish).
  amountHero: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 92,
    fontWeight: '600' as const,
    color: Colors.ink,
    letterSpacing: -1.6,
    lineHeight: 96,
  },
  // Small numeric chip — mono, deliberately low-emphasis.
  amountChip: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: 13,
    color: Colors.ink2,
  },
  // Italic voice transcript (kept; de-emphasized in new Listening / Confirm).
  transcript: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    fontStyle: 'italic' as const,
    color: Colors.ink3,
  },
} as const
