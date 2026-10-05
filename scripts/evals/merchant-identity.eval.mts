/**
 * Merchant identity eval (Oct 5 2026).
 *
 * Owner: a card purchase showed up as "711594-Mcgrath Volkswa" with a "7"
 * letter tile, and "our app should be intelligent in any kind of situation,
 * not just McGrath". This runs real card-network descriptors through the
 * exact production parse (same prompt, model, schema, temperature, seed)
 * and checks two things per case:
 *   - name: the merchant reads like the business (expected words present,
 *     no store numbers or processor prefixes left);
 *   - logo: the returned domain actually has a logo (the favicon service
 *     answers 200), or null where no logo is the honest answer.
 *
 * Run: node --env-file=.env --import tsx scripts/evals/merchant-identity.eval.mts
 */
import OpenAI from 'openai'
import { merchantLogoSrc } from '../../packages/shared/src/domain/merchantBrand.ts'
import { getPrompt, validateParsedExpense, isParseRejection, PARSED_EXPENSE_JSON_SCHEMA } from '../../packages/ai/src/index.ts'

const MODEL = process.env.AI_PARSE_MODEL ?? 'gpt-4o-mini-2024-07-18'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type Case = { raw: string; name: RegExp; logo: boolean }
const CASES: Case[] = [
  { raw: '711594-Mcgrath Volkswa', name: /mcgrath/i, logo: true },
  { raw: 'SQ *BLUE BOTTLE COFFEE', name: /blue bottle/i, logo: true },
  { raw: 'TST* JOES PIZZA 4421', name: /joe'?s pizza/i, logo: false },
  { raw: 'AMZN Mktp US*2K4L19XQ2', name: /amazon/i, logo: true },
  { raw: 'APPLE.COM/BILL', name: /apple/i, logo: true },
  { raw: 'PAYPAL *SPOTIFY', name: /spotify/i, logo: true },
  { raw: 'UBER *TRIP HELP.UBER.COM', name: /uber/i, logo: true },
  { raw: 'HY-VEE CEDAR RAPIDS 1062', name: /hy-?vee/i, logo: true },
  { raw: 'KWIK STAR 1093', name: /kwik/i, logo: true },
  { raw: 'CASEYS #3341 MARION IA', name: /casey/i, logo: true },
  { raw: 'WM SUPERCENTER #1489', name: /walmart/i, logo: true },
  { raw: 'TARGET T-1768', name: /target/i, logo: true },
  { raw: 'NETFLIX.COM LOS GATOS CA', name: /netflix/i, logo: true },
  { raw: 'GOOGLE *YouTubePremium', name: /youtube/i, logo: true },
  { raw: 'SP * GYMSHARK', name: /gymshark/i, logo: true },
  { raw: 'THE HOME DEPOT #2512', name: /home depot/i, logo: true },
  { raw: 'CHEWY.COM', name: /chewy/i, logo: true },
  { raw: 'PANERA BREAD #601334', name: /panera/i, logo: true },
  { raw: "MCDONALD'S F12345", name: /mcdonald/i, logo: true },
  { raw: 'COSTCO WHSE #0368', name: /costco/i, logo: true },
  { raw: 'SHELL OIL 57444091309', name: /shell/i, logo: true },
  { raw: 'DELTA AIR 0062345678901', name: /delta/i, logo: true },
  { raw: 'MARRIOTT CEDAR RAPIDS DT', name: /marriott/i, logo: true },
  { raw: 'STATE FARM INSURANCE', name: /state farm/i, logo: true },
  { raw: 'TOYOTA OF CEDAR RAPIDS', name: /toyota/i, logo: true },
  { raw: 'PRIME VIDEO*2K3L44', name: /prime video|amazon/i, logo: true },
  { raw: 'LYFT *RIDE SUN 4PM', name: /lyft/i, logo: true },
  { raw: 'CHICK-FIL-A #01845', name: /chick-fil-a/i, logo: true },
  { raw: 'DD *DOORDASH CHIPOTLE', name: /chipotle|doordash/i, logo: true },
  { raw: 'MAVERIK #05213 CEDAR R', name: /maverik/i, logo: true },
  { raw: 'ORSCHELN FARM HOME 112', name: /orscheln/i, logo: true },
  { raw: 'CEDAR RAPIDS MUNICIPAL GO', name: /cedar rapids/i, logo: false },
]

const JUNK = /#\s?\d|\b\d{4,}\b|^\W|\*|\bT-\d/

async function hasLogo(domain: string | null): Promise<boolean> {
  if (!domain) return false
  // The exact URL the app's logo tile loads.
  const url = merchantLogoSrc(domain)
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

async function parse(raw: string) {
  // The Apple Pay capture path's exact transcript shape.
  const transcript = `12.34 USD at ${raw}`
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_schema', json_schema: PARSED_EXPENSE_JSON_SCHEMA as never },
    temperature: 0,
    seed: 42,
    max_tokens: 500,
    messages: [
      { role: 'system', content: getPrompt({ locale: 'en', currency: 'USD', today: '2026-10-05', categories: ['Food & Dining', 'Shopping', 'Transport', 'Groceries', 'Entertainment', 'Bills & Utilities', 'Travel', 'Health'] }) },
      { role: 'user', content: transcript },
    ],
  })
  const out = validateParsedExpense(JSON.parse(completion.choices[0].message.content ?? '{}'))
  if (isParseRejection(out)) return { merchant: null, domain: null }
  return { merchant: out.merchant, domain: out.merchant_domain }
}

let nameOk = 0, logoOk = 0
const rows: string[] = []
for (const c of CASES) {
  const r = await parse(c.raw)
  const goodName = !!r.merchant && c.name.test(r.merchant) && !JUNK.test(r.merchant)
  const logo = await hasLogo(r.domain)
  const goodLogo = c.logo ? logo : true
  if (goodName) nameOk++
  if (goodLogo) logoOk++
  rows.push(`${goodName ? 'ok ' : 'BAD'} ${goodLogo ? 'ok ' : 'BAD'}  ${c.raw.padEnd(26)} -> ${String(r.merchant).padEnd(26)} ${r.domain ?? '-'}`)
}
console.log(rows.join('\n'))
console.log(`\nname ${nameOk}/${CASES.length}   logo ${logoOk}/${CASES.length}`)
