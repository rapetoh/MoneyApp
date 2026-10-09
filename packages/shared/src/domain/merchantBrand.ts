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

/** Strips a card-network descriptor down to its name: store numbers,
 *  payment-processor prefixes and trailing location junk.
 *  "Target T-1768" -> "Target", "711594-Mcgrath Volkswa" -> "Mcgrath Volkswa",
 *  "SQ *BLUE BOTTLE COFFEE" -> "BLUE BOTTLE COFFEE",
 *  "MAVERIK #05213 CEDAR R, Cedar Rapids, IA" -> "MAVERIK".
 *
 *  This is the instant, offline fallback; the AI parser does the real
 *  identification (expanding truncations, naming the brand, finding the
 *  logo domain). It runs when the AI has not answered yet, so it only ever
 *  removes what is unambiguously not part of a name, and returns the
 *  original string rather than an empty one. */
export function cleanMerchantDescriptor(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  let out = s
  // Trailing ", City, ST" / ", City" segments (keep the first segment).
  const firstComma = out.indexOf(',')
  if (firstComma > 0) out = out.slice(0, firstComma)
  // Bank transfer (ACH) codes: the payer or payee comes first and the rest
  // is routing detail. "ACME CORP PAYROLL PPD ID: 1234",
  // "ACME CORP DES:PAYROLL ID:XXXX INDN:JANE DOE CO ID:123 PPD" (Oct 8 2026,
  // CSV import).
  out = out
    .replace(/\s+(?:DES|INDN|CO ID|ID|ORIG ID|TRACE|WEB ID|PPD ID|CCD ID|TEL ID)\s*:.*$/i, '')
    .replace(/\s+(?:PPD|CCD|WEB|TEL|ACH|ACH CREDIT|ACH DEBIT|DIR DEP|DIRECT DEP(?:OSIT)?)\b.*$/i, '')
  out = out
    // Payment-processor prefixes: "SQ *", "TST*", "SP * ", "PAYPAL *",
    // "GOOGLE *", "DD *". The business follows the star.
    .replace(/^(?:SQ|TST|SP|PP|PY|IC|DD|PAYPAL|GOOGLE|APL)\s*\*\s*/i, '')
    // A leading store or terminal number: "711594-Mcgrath".
    .replace(/^\d{3,}[\s\-#*]*/, '')
    // Reference tails after a star that carry a digit: "Mktp US*2K4L19XQ2".
    // A star followed by a plain word is kept ("SQ *BLUE" was handled above).
    .replace(/\*(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+/g, ' ')
    // Store-number tokens: "#05213", "T-1768", "No. 42", "STORE 123", "F12345".
    .replace(/#\s?\d+/g, ' ')
    .replace(/\b(?:T|ST|STR|NO|STORE|UNIT)[-.]?\s?\d{2,}\b/gi, ' ')
    .replace(/\b[A-Z]{1,2}\d{4,}\b/gi, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
  out = out
    .replace(/\s{2,}/g, ' ')
    // Separators left dangling at either end: "-Mcgrath", "Joe's -".
    .replace(/^[\s\-\u2013\u2014#*.,:]+|[\s\-\u2013\u2014#*,:]+$/g, '')
    .trim()
  return out || s
}

/**
 * A merchant's website domain as the logo service needs it, or null.
 *
 * The parser's `merchant_domain` is model output: Oct 5 2026's eval caught
 * it returning the string "null", and URLs, paths and "www." prefixes are
 * all plausible. Anything that is not a bare host name is rejected rather
 * than sent to the logo service, which would just answer with nothing.
 */
export function normalizeMerchantDomain(raw: string | null | undefined): string | null {
  let d = (raw ?? '').trim().toLowerCase()
  if (!d || d === 'null' || d === 'none' || d === 'n/a') return null
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null
}

/**
 * The one logo URL for a merchant domain, shared by mobile, web and
 * notification attachments so every surface shows the same image.
 *
 * Asked for under "www.": measured Oct 5 2026 against 33 merchant domains,
 * the www. form returned a logo for all of them while the bare form missed
 * some (chick-fil-a.com: 404 bare, 200 with www.).
 */
export function merchantLogoSrc(domain: string): string {
  const host = domain.startsWith('www.') ? domain : `www.${domain}`
  return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${host}&size=128`
}

/**
 * Give a merchant the casing a person would write (Sep 21, 2026).
 *
 * Speech and card descriptors arrive shouting or whispering: "target",
 * "DOLLAR TREE", "walmart". Stored verbatim, the same shop appears twice
 * in a list with two different spellings, which looks like two shops. So a
 * string that carries no case decision of its own gets title case.
 *
 * A string that already mixes cases is left exactly as it is: "iPhone",
 * "eBay" and "McDonald's" are choices, not accidents. Short all-caps
 * tokens stay too, because they are nearly always acronyms ("KFC", "BP",
 * "IKEA") and "Kfc" is worse than the problem being fixed.
 */
export function normalizeMerchantCase(raw: string | null | undefined): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (/\p{Ll}/u.test(s) && /\p{Lu}/u.test(s)) return s
  return s.replace(/[\p{L}\p{N}'\u2019&.]+/gu, (word) => {
    if (word.length <= 4 && word === word.toUpperCase() && /\p{Lu}/u.test(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  })
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
