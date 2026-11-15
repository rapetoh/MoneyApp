/**
 * Business identity (migration 045, docs/businesses.md): every business is
 * drawn as its uploaded logo or one of these twelve icons, never as a
 * letter. The keys are Ionicons names on the phone (drawn in their
 * `-outline` cut); the web draws the same outlines as inline SVG.
 *
 * The list is mirrored by the `businesses_icon_check` constraint in
 * supabase/migrations/045_business_identity.sql. Add a key in both places
 * or the server refuses it.
 */
export const BUSINESS_ICONS = [
  'storefront',
  'leaf',
  'book',
  'camera',
  'briefcase',
  'car',
  'restaurant',
  'color-palette',
  'construct',
  'paw',
  'cart',
  'cut',
] as const

export type BusinessIconKey = (typeof BUSINESS_ICONS)[number]

const ICON_SET: ReadonlySet<string> = new Set(BUSINESS_ICONS)

export function isBusinessIconKey(value: unknown): value is BusinessIconKey {
  return typeof value === 'string' && ICON_SET.has(value)
}

/** Whole words (any case) that point at an icon. */
const KEYWORDS: ReadonlyArray<readonly [BusinessIconKey, readonly string[]]> = [
  ['leaf', ['farm', 'garden', 'ranch', 'orchard', 'plant', 'flower']],
  [
    'storefront',
    ['booth', 'shop', 'store', 'antique', 'antiques', 'market', 'boutique', 'vintage'],
  ],
  ['book', ['book', 'books', 'author', 'writing', 'press']],
  ['camera', ['photo', 'photography', 'studio']],
  ['car', ['uber', 'lyft', 'ride', 'rideshare', 'driving', 'delivery', 'courier']],
  ['restaurant', ['bake', 'bakery', 'food', 'catering', 'cafe', 'kitchen', 'chef']],
  ['color-palette', ['design', 'art', 'paint', 'craft', 'crafts']],
  ['construct', ['repair', 'construction', 'handyman', 'contractor', 'build']],
  ['paw', ['pet', 'dog', 'dogs', 'groom', 'grooming']],
  ['cut', ['salon', 'barber', 'hair', 'nails']],
  ['cart', ['etsy', 'ebay', 'resale', 'online', 'reseller']],
]

const ICON_FOR_WORD: ReadonlyMap<string, BusinessIconKey> = new Map(
  KEYWORDS.flatMap(([icon, words]) => words.map((w) => [w, icon] as const)),
)

/**
 * The icon a new business starts with, from its name. Matches whole words,
 * any case: "Farm" and "Hill Farm" get the leaf, "Farmhouse Goods" does
 * not. When the name holds words for two icons, the first word wins,
 * because people name a business by what it is first: "Art studio" is a
 * palette, "Etsy shop" a cart, "Book store" a book. Accents fold, so
 * "Café" reads as cafe. No match: briefcase.
 */
export function defaultBusinessIcon(name: string): BusinessIconKey {
  const folded = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  for (const word of folded.match(/[\p{L}\p{N}]+/gu) ?? []) {
    const icon = ICON_FOR_WORD.get(word)
    if (icon) return icon
  }
  return 'briefcase'
}

/** What a business renders when it has no logo: its stored icon, else the
 *  one its name suggests (rows made before migration 045 or by an older
 *  app build carry no icon). */
export function businessIcon(business: { name: string; icon?: string | null }): BusinessIconKey {
  return isBusinessIconKey(business.icon) ? business.icon : defaultBusinessIcon(business.name)
}

/** Data URL prefixes the server accepts for `businesses.logo` (045). */
export const BUSINESS_LOGO_PATTERN = /^data:image\/(png|jpeg|webp);base64,/

/** Upper bound on `businesses.logo`, in characters (045). */
export const BUSINESS_LOGO_MAX_LENGTH = 200000

/** True when `logo` is a value the server would store and an image tag can
 *  draw. Anything else renders the icon instead. */
export function isBusinessLogo(logo: string | null | undefined): logo is string {
  return (
    typeof logo === 'string' &&
    logo.length <= BUSINESS_LOGO_MAX_LENGTH &&
    BUSINESS_LOGO_PATTERN.test(logo)
  )
}
