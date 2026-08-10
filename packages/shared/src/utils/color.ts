// Color math, merchant-avatar color/domain guessing, and category-tint
// derivation — one place for all three (fix-plan 4.4 / audit 01-F28,
// 07-F26, 07-F27). Previously `merchantColor` lived in `currency.ts` and
// `KNOWN_DOMAINS`/`guessDomain` were duplicated byte-for-byte between
// `apps/mobile/src/components/MerchantAvatar.tsx` and
// `apps/web/src/components/MerchantLogo.tsx` — a change to one silently
// diverged from the other. Both components now import from here.

// ─────────────────────────────────────────────────────────────────────────
// Color math — hex ⇄ HSL, WCAG relative luminance and contrast ratio.
// Used only by `categoryPalette` and `merchantColor` below; kept private
// except `contrastRatio`, which is exported so tests (and any future
// caller that needs to *verify* a pairing, not just generate one) don't
// have to reimplement the WCAG formula a third time.
// ─────────────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Returns `[hue 0-360, saturation 0-100, lightness 0-100]`. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0)
      break
    case gn:
      h = (bn - rn) / d + 2
      break
    default:
      h = (rn - gn) / d + 4
  }
  return [h * 60, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = h / 360
  const sn = s / 100
  const ln = l / 100
  if (sn === 0) return [ln * 255, ln * 255, ln * 255]

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  return [255 * hue2rgb(p, q, hn + 1 / 3), 255 * hue2rgb(p, q, hn), 255 * hue2rgb(p, q, hn - 1 / 3)]
}

function hslToHex(h: number, s: number, l: number): string {
  return rgbToHex(...hslToRgb(h, s, l))
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG 2.x contrast ratio between two colors, 1 (identical) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA) + 0.05
  const lB = relativeLuminance(hexB) + 0.05
  return lA > lB ? lA / lB : lB / lA
}

// ─────────────────────────────────────────────────────────────────────────
// Merchant avatar fallback color — deterministic hash of the merchant
// name into a fixed palette, used when there's no logo (no domain, or the
// favicon fetch failed).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Deep, muted palette for the merchant-avatar fallback tile (white
 * initial on a solid background). This *is* `avatarColors` from
 * `apps/mobile/src/theme/colors.ts` — that array already existed for
 * exactly this purpose but was never wired to `merchantColor`, which
 * used its own lighter 12-entry palette instead. Four of those twelve
 * (`#F48C06`, `#2A9D8F`, `#B5838D`, `#C77DFF`) render white text at
 * 2.2–2.8:1, well under the 4.5:1 WCAG AA floor for body text (fix-plan
 * 4.4 / audit 01-F28). Every entry here clears 4.5:1 — see
 * `color.test.ts`, which asserts it for the whole array so a future
 * palette edit can't reintroduce the failure.
 */
const AVATAR_COLORS = [
  '#8C4A2A', // peach-deep
  '#3F5A3E', // sage
  '#5A4E7A', // lavender-deep
  '#8A6F1F', // butter-deep
  '#8E424C', // rose-deep
  '#5A5F34', // olive-deep
  '#4A6B74', // dusty teal
  '#6B4E3D', // warm taupe
]

/** Deterministic color from a string (for merchant avatar fallback). */
export function merchantColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─────────────────────────────────────────────────────────────────────────
// Merchant-logo domain guessing — shared by `MerchantAvatar` (mobile) and
// `MerchantLogo` (web). See each component's privacy-disclosure comment
// (fix-plan 3.5) for why the resulting domain is queried directly against
// Google's favicon service rather than proxied through the app's own API.
// ─────────────────────────────────────────────────────────────────────────

/** Well-known merchants whose domain can't be derived by stripping spaces. */
export const KNOWN_DOMAINS: Record<string, string> = {
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  amazon: 'amazon.com',
  walmart: 'walmart.com',
  target: 'target.com',
  costco: 'costco.com',
  starbucks: 'starbucks.com',
  mcdonalds: 'mcdonalds.com',
  uber: 'uber.com',
  ubereats: 'ubereats.com',
  lyft: 'lyft.com',
  apple: 'apple.com',
  google: 'google.com',
  microsoft: 'microsoft.com',
  adobe: 'adobe.com',
  hulu: 'hulu.com',
  disneyplus: 'disneyplus.com',
  disney: 'disney.com',
  hbomax: 'hbomax.com',
  youtube: 'youtube.com',
  paypal: 'paypal.com',
  venmo: 'venmo.com',
  cashapp: 'cash.app',
  bestbuy: 'bestbuy.com',
  homedepot: 'homedepot.com',
  lowes: 'lowes.com',
  ikea: 'ikea.com',
  nike: 'nike.com',
  adidas: 'adidas.com',
  zara: 'zara.com',
  sephora: 'sephora.com',
  wholefoods: 'wholefoods.com',
  traderjoes: 'traderjoes.com',
  kroger: 'kroger.com',
  walgreens: 'walgreens.com',
  cvs: 'cvs.com',
  tmobile: 't-mobile.com',
  verizon: 'verizon.com',
  att: 'att.com',
  comcast: 'comcast.com',
  chipotle: 'chipotle.com',
  doordash: 'doordash.com',
  grubhub: 'grubhub.com',
  airbnb: 'airbnb.com',
  booking: 'booking.com',
  expedia: 'expedia.com',
  playstation: 'playstation.com',
  xbox: 'xbox.com',
  steam: 'steampowered.com',
  github: 'github.com',
  notion: 'notion.so',
  slack: 'slack.com',
  zoom: 'zoom.us',
  dropbox: 'dropbox.com',
  chickfila: 'chick-fil-a.com',
  burgerking: 'bk.com',
  wendys: 'wendys.com',
  dominos: 'dominos.com',
  pizzahut: 'pizzahut.com',
  subways: 'subway.com',
  subway: 'subway.com',
  dunkin: 'dunkindonuts.com',
  panera: 'panerabread.com',
}

export function guessDomain(name: string): string {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return KNOWN_DOMAINS[normalized] ?? `${normalized}.com`
}

// ─────────────────────────────────────────────────────────────────────────
// Category tint derivation — `categories.color` is the single per-user,
// user-editable source of truth (fix-plan 4.4). Chart surfaces used to
// pick a tint from two hard-coded 6–8 entry tables (`apps/mobile/src/
// theme/colors.ts`'s `categoryTints`, `apps/web/src/lib/theme.ts`'s `cat`)
// keyed by a *name*-regex heuristic (`apps/web/src/lib/categories.ts`'s
// `tintFor`) — so renaming "Take-out" to "Food & Dining" silently changed
// its chart color, and a chart's color could disagree with the same
// category's own row/chip color, which already read `categories.color`
// directly. Both tables and the heuristic are deleted; every chart call
// site now derives its tint from the category's own hex via this
// function, so the two can never disagree again.
// ─────────────────────────────────────────────────────────────────────────

export interface CategoryPalette {
  /** Light wash — chip/pill backgrounds, chart "soft" fills. */
  bg: string
  /**
   * Deep, saturation-clamped tone of the same hue. Guaranteed ≥4.5:1
   * against both `bg` and white by construction — safe as chart
   * line/bar color, chip text, *and* as a solid avatar-tile background
   * with white text (fix-plan 4.4's fallback-tile contrast fix), for
   * any hex a user picks from the category color editor, not just the
   * 20 seeded defaults.
   */
  fg: string
}

const CATEGORY_PALETTE_CACHE = new Map<string, CategoryPalette>()

/** Derives a chart-safe `{bg, fg}` pair from a category's own hex color. */
export function categoryPalette(hex: string): CategoryPalette {
  const cached = CATEGORY_PALETTE_CACHE.get(hex)
  if (cached) return cached

  const [h, rawS] = rgbToHsl(...hexToRgb(hex))
  // Near-gray inputs (saturation < 8%) have an unstable/arbitrary hue —
  // forcing them up to the normal 45–68% saturation band below would
  // paint a neutral gray category (e.g. seeded "Fees & Charges" #757575)
  // an arbitrary, unrelated color. Keep near-gray inputs near-gray.
  const neutral = rawS < 8
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

  const bgS = neutral ? clamp(rawS, 6, 14) : clamp(rawS, 22, 38)
  const bg = hslToHex(h, bgS, 90)

  const fgS = neutral ? clamp(rawS, 6, 14) : clamp(rawS, 45, 68)
  let l = 34
  let fg = hslToHex(h, fgS, l)
  // Walk lightness down until `fg` clears 4.5:1 against both the tint
  // it's paired with and white (the avatar-tile case). Every seeded
  // default category converges within a handful of steps; the L=4 floor
  // is a hard stop against an infinite loop on a pathological input,
  // not a value expected to be hit in practice.
  for (let guard = 0; guard < 40 && l > 4; guard++) {
    if (contrastRatio(fg, bg) >= 4.5 && contrastRatio(fg, '#FFFFFF') >= 4.5) break
    l -= 2
    fg = hslToHex(h, fgS, l)
  }

  const result: CategoryPalette = { bg, fg }
  CATEGORY_PALETTE_CACHE.set(hex, result)
  return result
}
