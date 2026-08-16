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
  // Ask Murmur insight kinds (docs/ask-murmur/SPEC.md §1.1).
  calendar: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke={color} strokeWidth="1.8" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  trend: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 17l5-5 4 4 7-8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 8h5v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  wallet: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="7" width="18" height="12" rx="2.5" stroke={color} strokeWidth="1.8" />
      <path d="M3 10h18M16 14.5h2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  alert: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.8" />
      <path d="M12 8v5M12 16.2v.3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  swap: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 4v16M8 4L5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
  pencil: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  trash: ({ color = 'currentColor', size = 16 }: Props) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v5M14 11v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
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
