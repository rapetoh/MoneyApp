// Jakarta Sans for UI text, DM Mono for numbers
// Fonts are loaded via expo-font in _layout.tsx
// Text roles mirror the Pencil design policy — use `Text` presets app-wide.
import { Colors } from './colors'

export const Typography = {
  fontFamily: {
    sans: 'PlusJakartaSans',
    sansBold: 'PlusJakartaSans-Bold',
    sansSemiBold: 'PlusJakartaSans-SemiBold',
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
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const

// Text role presets — derived directly from the Pencil design.
// Use these instead of hand-assembling fontFamily + fontSize + color per Text node.
export const Text = {
  // Page-level nav bar title (e.g. "Record Expense")
  navTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 17,
    color: Colors.text,
  },
  // Big page H1 (e.g. "What did you spend?")
  h1: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: 24,
    color: Colors.text,
  },
  // Screen-level H2 / card section titles
  h2: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.text,
  },
  // Default body text / field values
  body: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.text,
  },
  // Non-emphasized body
  bodyRegular: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.text,
  },
  // Subtitle / supporting copy under a heading
  subtitle: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 14,
    color: Colors.textMuted,
  },
  // Field labels (form labels, card field labels)
  label: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  // Small hints, captions
  hint: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 13,
    color: Colors.textMuted,
  },
  // Button text
  button: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.white,
  },
  buttonSecondary: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  // Mono for currency amounts
  amount: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: 16,
    color: Colors.text,
  },
  amountLarge: {
    fontFamily: Typography.fontFamily.monoBold,
    fontSize: 30,
    color: Colors.text,
  },
  // Italic voice transcript
  transcript: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    fontStyle: 'italic' as const,
    color: Colors.textSecondary,
  },
} as const
