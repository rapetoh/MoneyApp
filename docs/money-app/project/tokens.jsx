// Design tokens for Murmur — voice expense tracker
// Calm, premium, warm. Not fintech-blue.

const T = {
  // Warm neutrals
  bg:       '#FBFAF7',   // mobile canvas
  bgDesk:   '#F4F1EA',   // desktop app canvas
  surface:  '#FFFFFF',
  surface2: '#F5F2EB',   // recessed surface
  line:     'rgba(40,36,28,0.08)',
  lineHard: 'rgba(40,36,28,0.14)',

  ink:      '#1B1915',   // near-black, warm
  ink2:     '#3A3630',   // body
  ink3:     '#6C675E',   // secondary
  ink4:     '#9C9589',   // tertiary / hints

  // Accent — a calm deep sage
  accent:   '#3F5A3E',
  accentSoft:'#E8EDE3',

  // Category tints (soft, harmonious, low-sat)
  cat: {
    food:     { bg: '#F3E7DC', fg: '#7A4A22' },   // peach
    transit:  { bg: '#E1E6E0', fg: '#395435' },   // sage
    shopping: { bg: '#EEE6F0', fg: '#5C3F66' },   // lavender
    bills:    { bg: '#E4E8EE', fg: '#334155' },   // sky-slate
    coffee:   { bg: '#F2E8D5', fg: '#7A5A1C' },   // butter
    health:   { bg: '#F4DDDD', fg: '#843C3C' },   // rose
    work:     { bg: '#E6E7E0', fg: '#45463A' },   // olive
    other:    { bg: '#ECE8E0', fg: '#5A5247' },
  },

  // Fonts
  fSans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Helvetica Neue", system-ui, sans-serif',
  fDisp: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif',
  fSerif: '"New York", "Iowan Old Style", "Georgia", "Times New Roman", serif',
  fMono: '"SF Mono", "JetBrains Mono", "Menlo", monospace',
};

// Tiny SF-symbols-ish glyphs (stroke icons). Keep set small.
const Icon = {
  mic: (c='#1B1915', s=22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" fill={c}/>
      <path d="M6 11a6 6 0 0012 0M12 17v4M9 21h6" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  plus: (c='#1B1915', s=20) => (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  search: (c='#1B1915', s=18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke={c} strokeWidth="1.8"/>
      <path d="M16 16l4 4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  list: (c='#1B1915', s=20) => (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>
  ),
  chart: (c='#1B1915', s=20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M4 20V9m6 11V4m6 16v-8m6 8V14" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>
  ),
  settings: (c='#1B1915', s=20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.8"/>
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  chev: (c='#9C9589', s=14) => (
    <svg width={s} height={s} viewBox="0 0 14 14"><path d="M5 2l5 5-5 5" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  check: (c='#fff', s=14) => (
    <svg width={s} height={s} viewBox="0 0 14 14"><path d="M2 7l3.5 3.5L12 4" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  close: (c='#1B1915', s=18) => (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  lock: (c='#1B1915', s=16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke={c} strokeWidth="1.8"/>
      <path d="M8 11V7a4 4 0 118 0v4" stroke={c} strokeWidth="1.8"/>
    </svg>
  ),
  sparkle: (c='#1B1915', s=16) => (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6.5 6.5l4 4M13.5 13.5l4 4M17.5 6.5l-4 4M10.5 13.5l-4 4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/></svg>
  ),
  wave: (c='#3F5A3E', s=20, active=true) => {
    const bars = [6,14,9,18,11,20,13,9,16,7,12,8,15];
    return (
      <svg width={s*2} height={s} viewBox={`0 0 ${bars.length*4} ${s}`}>
        {bars.map((h,i)=>(
          <rect key={i} x={i*4+1} y={(s-h)/2} width="2" height={h} rx="1" fill={c} opacity={active?1:0.35}/>
        ))}
      </svg>
    );
  },
};

// Category chip pill
function Chip({ cat='other', label, size='md' }) {
  const c = T.cat[cat] || T.cat.other;
  const pad = size==='sm' ? '3px 8px' : '5px 10px';
  const fs = size==='sm' ? 11 : 12;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center',
      background: c.bg, color: c.fg, padding: pad,
      borderRadius: 999, fontSize: fs, fontWeight: 600,
      letterSpacing: 0.1, fontFamily: T.fSans, whiteSpace:'nowrap',
    }}>{label}</span>
  );
}

// Money — serif for big figures, sans for small
function Money({ value, size=28, muted=false, serif=true, bold=600, sign='$' }) {
  const isNeg = value < 0;
  const abs = Math.abs(value);
  const [int, dec] = abs.toFixed(2).split('.');
  const intFmt = parseInt(int,10).toLocaleString('en-US');
  return (
    <span style={{
      fontFamily: serif ? T.fSerif : T.fDisp,
      fontSize: size, fontWeight: serif ? 500 : bold,
      color: muted ? T.ink3 : T.ink,
      letterSpacing: serif ? -0.5 : -0.8,
      fontVariantNumeric: 'tabular-nums',
      whiteSpace:'nowrap',
    }}>
      {isNeg && '−'}
      <span style={{ opacity: 0.55, fontSize: size*0.58, marginRight: 1, verticalAlign: size>40?'0.4em':'0.15em' }}>{sign}</span>
      {intFmt}
      <span style={{ opacity: 0.55 }}>.{dec}</span>
    </span>
  );
}

// Merchant logo tile — real brand color if known, else letter fallback
const MERCHANTS = {
  'Netflix':        { bg:'#E50914', fg:'#fff', mono:'N' },
  'Uber':           { bg:'#000',    fg:'#fff', mono:'U' },
  'Blue Bottle':    { bg:'#0A3C7B', fg:'#fff', mono:'B' },
  'Blue Bottle Coffee': { bg:'#0A3C7B', fg:'#fff', mono:'B' },
  "Trader Joe's":   { bg:'#B81F25', fg:'#fff', mono:'TJ' },
  'Amazon':         { bg:'#FF9900', fg:'#000', mono:'a' },
  'Apple':          { bg:'#000',    fg:'#fff', mono:'' },
  'Walgreens':      { bg:'#E31837', fg:'#fff', mono:'W' },
  'Rappi':          { bg:'#FF4F41', fg:'#fff', mono:'R' },
  'Spotify':        { bg:'#1DB954', fg:'#000', mono:'S' },
  'Lyft':           { bg:'#FF00BF', fg:'#fff', mono:'L' },
  'Starbucks':      { bg:'#00704A', fg:'#fff', mono:'✦' },
  'Whole Foods':    { bg:'#004B2D', fg:'#fff', mono:'WF' },
};
function MerchantLogo({ name, cat='other', size=40, radius=12 }) {
  const known = Object.keys(MERCHANTS).find(k => name && name.includes(k));
  if (known) {
    const m = MERCHANTS[known];
    return (
      <div style={{
        width: size, height: size, borderRadius: radius, background: m.bg,
        color: m.fg, display:'flex', alignItems:'center', justifyContent:'center',
        fontWeight: 800, fontSize: size*0.42, flexShrink: 0,
        fontFamily: T.fDisp, letterSpacing: -0.5,
      }}>{m.mono}</div>
    );
  }
  const c = T.cat[cat] || T.cat.other;
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: c.bg, color: c.fg,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontWeight: 700, fontSize: size*0.4, flexShrink: 0, letterSpacing: -0.3,
    }}>{(name || '?')[0]}</div>
  );
}

Object.assign(window, { T, Icon, Chip, Money, MerchantLogo, MERCHANTS });
