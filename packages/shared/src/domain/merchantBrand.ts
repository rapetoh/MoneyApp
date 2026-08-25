// Card-network merchant descriptors → something presentable (Aug 24, 2026,
// owner remark: Chase shows the Target logo for "Target T-1768"; Murmur
// showed a letter tile).
//
// A tap-to-pay descriptor is not a brand name: "Target T-1768",
// "MAVERIK #05213 CEDAR R, Cedar Rapids, IA", "STARBUCKS #12345". Banks
// license commercial enrichment databases to map these to brands; our
// budget version is (1) strip the store-number/location junk and (2) a
// curated brand→domain table for the big chains, which feeds the same
// favicon pipeline the AI's `merchant_domain` feeds. Unknown local
// merchants ("Canteen Des Moines 2") keep the letter tile — the honest
// ceiling without a paid data feed.

/** Strips store numbers and trailing location junk from a card-network
 *  descriptor: "Target T-1768" → "Target",
 *  "MAVERIK #05213 CEDAR R, Cedar Rapids, IA" → "MAVERIK".
 *  Conservative: only patterns that are unambiguously junk; when the
 *  result would be empty, the original (trimmed) string is returned. */
export function cleanMerchantDescriptor(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  let out = s
  // Trailing ", City, ST" / ", City" segments (keep the first segment).
  const firstComma = out.indexOf(',')
  if (firstComma > 0) out = out.slice(0, firstComma)
  // Store-number tokens: "#05213", "T-1768", "No. 42", "STORE 123", "*AB12".
  out = out
    .replace(/\*[A-Za-z0-9]+/g, ' ')
    .replace(/#\s?\d+/g, ' ')
    .replace(/\b(?:T|ST|STR|NO|STORE|UNIT)[-.]?\s?\d{2,}\b/gi, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
  // Truncated ALL-CAPS location tails after the junk strip ("MAVERIK CEDAR R").
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out || s
}

/** Brand table: descriptor pattern → the brand's website domain (what the
 *  favicon pipeline needs). First match wins. Patterns run against the
 *  RAW descriptor so store numbers can't break the match. */
const BRAND_DOMAINS: ReadonlyArray<{ pattern: RegExp; domain: string }> = [
  { pattern: /\btarget\b/i, domain: 'target.com' },
  { pattern: /\bwal-?mart\b/i, domain: 'walmart.com' },
  { pattern: /\bcostco\b/i, domain: 'costco.com' },
  { pattern: /\bsam'?s club\b/i, domain: 'samsclub.com' },
  { pattern: /\b(amazon|amzn)\b/i, domain: 'amazon.com' },
  { pattern: /\bstarbucks\b/i, domain: 'starbucks.com' },
  { pattern: /\bchick[- ]?fil[- ]?a\b/i, domain: 'chick-fil-a.com' },
  { pattern: /\bmcdonald/i, domain: 'mcdonalds.com' },
  { pattern: /\bchipotle\b/i, domain: 'chipotle.com' },
  { pattern: /\bdunkin/i, domain: 'dunkindonuts.com' },
  { pattern: /\bpanera\b/i, domain: 'panerabread.com' },
  { pattern: /\bwendy'?s\b/i, domain: 'wendys.com' },
  { pattern: /\btaco bell\b/i, domain: 'tacobell.com' },
  { pattern: /\bkfc\b/i, domain: 'kfc.com' },
  { pattern: /\bpopeyes\b/i, domain: 'popeyes.com' },
  { pattern: /\bdomino'?s\b/i, domain: 'dominos.com' },
  { pattern: /\bpizza hut\b/i, domain: 'pizzahut.com' },
  { pattern: /\bfive guys\b/i, domain: 'fiveguys.com' },
  { pattern: /\bculver'?s\b/i, domain: 'culvers.com' },
  { pattern: /\bsubway\b/i, domain: 'subway.com' },
  { pattern: /\bsonic\b/i, domain: 'sonicdrivein.com' },
  { pattern: /\barby'?s\b/i, domain: 'arbys.com' },
  { pattern: /\bdairy queen\b/i, domain: 'dairyqueen.com' },
  { pattern: /\bshake shack\b/i, domain: 'shakeshack.com' },
  { pattern: /\bpanda express\b/i, domain: 'pandaexpress.com' },
  { pattern: /\bdoordash\b/i, domain: 'doordash.com' },
  { pattern: /\buber\s?eats\b/i, domain: 'ubereats.com' },
  { pattern: /\bgrubhub\b/i, domain: 'grubhub.com' },
  { pattern: /\binstacart\b/i, domain: 'instacart.com' },
  { pattern: /\buber\b/i, domain: 'uber.com' },
  { pattern: /\blyft\b/i, domain: 'lyft.com' },
  { pattern: /\bmaverik\b/i, domain: 'maverik.com' },
  { pattern: /\bkwik\s?(star|trip)\b/i, domain: 'kwiktrip.com' },
  { pattern: /\bmurphy\s?(usa|express)?\b/i, domain: 'murphyusa.com' },
  { pattern: /\bshell\b/i, domain: 'shell.com' },
  { pattern: /\bchevron\b/i, domain: 'chevron.com' },
  { pattern: /\bexxon\b/i, domain: 'exxon.com' },
  { pattern: /\bcasey'?s\b/i, domain: 'caseys.com' },
  { pattern: /\bkum\s?&?\s?go\b/i, domain: 'kumandgo.com' },
  { pattern: /\bspeedway\b/i, domain: 'speedway.com' },
  { pattern: /\bcircle\s?k\b/i, domain: 'circlek.com' },
  { pattern: /\b7-?eleven\b/i, domain: '7-eleven.com' },
  { pattern: /\bwawa\b/i, domain: 'wawa.com' },
  { pattern: /\bsheetz\b/i, domain: 'sheetz.com' },
  { pattern: /\bkroger\b/i, domain: 'kroger.com' },
  { pattern: /\bhy-?vee\b/i, domain: 'hy-vee.com' },
  { pattern: /\baldi\b/i, domain: 'aldi.us' },
  { pattern: /\btrader joe'?s\b/i, domain: 'traderjoes.com' },
  { pattern: /\bwhole foods\b/i, domain: 'wholefoodsmarket.com' },
  { pattern: /\bwalgreens\b/i, domain: 'walgreens.com' },
  { pattern: /\bcvs\b/i, domain: 'cvs.com' },
  { pattern: /\bbest ?buy\b/i, domain: 'bestbuy.com' },
  { pattern: /\bhome ?depot\b/i, domain: 'homedepot.com' },
  { pattern: /\blowe'?s\b/i, domain: 'lowes.com' },
  { pattern: /\bdollar tree\b/i, domain: 'dollartree.com' },
  { pattern: /\bdollar general\b/i, domain: 'dollargeneral.com' },
  { pattern: /\bikea\b/i, domain: 'ikea.com' },
  { pattern: /\bnetflix\b/i, domain: 'netflix.com' },
  { pattern: /\bspotify\b/i, domain: 'spotify.com' },
  { pattern: /\bapple\.com\/bill|itunes\b/i, domain: 'apple.com' },
  { pattern: /\bpetco\b/i, domain: 'petco.com' },
  { pattern: /\bpetsmart\b/i, domain: 'petsmart.com' },
  { pattern: /\bchewy\b/i, domain: 'chewy.com' },
  { pattern: /\bsephora\b/i, domain: 'sephora.com' },
  { pattern: /\bulta\b/i, domain: 'ulta.com' },
  { pattern: /\bairbnb\b/i, domain: 'airbnb.com' },
  { pattern: /\bmarriott\b/i, domain: 'marriott.com' },
  { pattern: /\bhilton\b/i, domain: 'hilton.com' },
  { pattern: /\bdelta\b/i, domain: 'delta.com' },
  { pattern: /\bsouthwest\b/i, domain: 'southwest.com' },
]

/** The brand's website domain for a raw card-network descriptor, or null
 *  when the merchant isn't a known chain. */
export function brandDomainForMerchant(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  for (const { pattern, domain } of BRAND_DOMAINS) {
    if (pattern.test(s)) return domain
  }
  return null
}
