// Jakarta Sans for UI text, DM Mono for numbers
// Fonts are loaded via expo-font in _layout.tsx
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
