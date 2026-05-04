// Tiny stroke icons matching the project tokens at
// docs/money-app/project/tokens.jsx. SF-symbols-ish, kept small. All icons
// take an optional color + size and inherit currentColor by default so they
// can be tinted by the surrounding text.

type Props = { color?: string; size?: number }

export const Icon = {
  mic: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" fill={color} />
      <path
        d="M6 11a6 6 0 0012 0M12 17v4M9 21h6"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  plus: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  search: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  list: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  chart: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20V9m6 11V4m6 16v-8m6 8V14"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  sparkle: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M12 3v6M12 15v6M3 12h6M15 12h6M6.5 6.5l4 4M13.5 13.5l4 4M17.5 6.5l-4 4M10.5 13.5l-4 4"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  settings: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" />
      <path
        d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  download: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  refresh: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12a9 9 0 0115-6.7L21 8M21 4v4h-4M21 12a9 9 0 01-15 6.7L3 16M3 20v-4h4"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  micOff: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" fill={color} opacity="0.3" />
      <path
        d="M6 11a6 6 0 0012 0M12 17v4M9 21h6M3 3l18 18"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  // Tight refresh-loop glyph used to mark recurring transactions inline.
  recurring: ({ color = 'currentColor', size = 12 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2.5 8a5.5 5.5 0 019.5-3.7L13.5 6M13.5 3.5V6h-2.5M13.5 8a5.5 5.5 0 01-9.5 3.7L2.5 10M2.5 12.5V10H5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  send: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l14-7-7 14-2-5-5-2z"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  ),
  lock: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M8 11V7a4 4 0 118 0v4" stroke={color} strokeWidth="1.8" />
    </svg>
  ),
  signOut: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M9 19H5a2 2 0 01-2-2V7a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  // Small downward chevron used in toolbar filter chips.
  chev: ({ color = 'currentColor', size = 12 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M4 6l4 4 4-4"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
}
