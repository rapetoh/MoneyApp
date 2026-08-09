// The golden corpus — audit 02-F27 / fix-plan item 1.1.
//
// A checked-in table of utterances with the fields the voice parse
// pipeline (packages/ai/src/parser.ts + prompt.ts) must produce. Each row
// carries a hand-authored `rawResponse`: a stand-in for what a recorded
// live-model call would return, grounded in a close reading of the
// CURRENT prompt.ts rules (not aspiration — see the comment on each
// diverging row). `goldenCorpus.test.ts` replays it through the real
// `parseExpense()` with `fetch` mocked to return `rawResponse`, so the
// merge/defaulting logic in parser.ts is genuinely exercised — only the
// network call is faked.
//
// Refreshing against the real model: `npm run golden:verify-live -w
// @voice-expense/ai` (requires OPENAI_API_KEY) calls the live API for
// every row and prints a diff against `rawResponse`. It does not rewrite
// this file — a human decides whether drift means the prompt regressed
// or this file is stale.
//
// `flow_type` is part of the row's `expected` shape because item 1.1's
// spec names it. `ParsedExpense` gained the field in fix-plan item 1.7
// ("the model classifies intent; code decides the sign") — every row's
// `rawResponse` now carries a `flow_type` (via `passingRow`'s default, or
// explicitly where a row's utterance needs a non-"expense"/"income"
// value), and `goldenCorpus.test.ts` asserts it wherever a row sets
// `expected.flowType` explicitly. Rows that don't set it are still
// exercised end-to-end (the pipeline round-trips `flow_type` regardless)
// but aren't individually pinned to a specific value — most of this
// corpus's utterances are plain purchases/income with no transfer,
// refund, or reimbursement semantics worth calling out row-by-row.
//
// Rows are graded with `test.fails` when `knownFailing` is true: the
// suite stays green today, but the moment the underlying bug is fixed,
// `test.fails` itself starts failing — the "hold a fix down" mechanism —
// forcing whoever fixed it to flip `knownFailing` to false (turning the
// row into an ordinary regression test) instead of the fix silently
// going unguarded.

import type { Locale, FlowType } from '@voice-expense/shared'

interface GoldenCorpusExpectation {
  direction: 'debit' | 'credit'
  amount: number
  isRecurringSuggestion: boolean
  /** Asserted against `result.flow_type` when set — see file header.
   *  Rows that omit it default `rawResponse.flow_type` from `direction`
   *  ("credit" → "income", "debit" → "expense") but aren't individually
   *  pinned to that value. */
  flowType?: FlowType
  noteContains?: string
  needsClarification?: boolean
}

export interface GoldenCorpusRow {
  id: string
  /** Audit finding this row pins, if any. */
  finding?: string
  lang: Locale
  utterance: string
  expected: GoldenCorpusExpectation
  rawResponse: Record<string, unknown>
  /** See file header — graded with `test.fails` when true. */
  knownFailing?: boolean
  /** Why it's still failing, and what item/finding closes it. */
  knownFailingReason?: string
}

const RAW_DEFAULTS = {
  currency: 'USD',
  merchant: null,
  merchant_domain: null,
  note: null,
  category_suggestion: null,
  payment_method: null,
  transacted_at: '2026-08-09T12:00:00.000Z',
  confidence: 0.92,
  needs_clarification: false,
  clarifying_question: null,
  recurring_frequency_suggestion: null,
} as const

/** The `flow_type` a row gets when it doesn't name one explicitly —
 *  "credit" rows are plain income, "debit" rows are plain expenses. Real
 *  transfers/refunds/reimbursements are the exception, not the default,
 *  which is why `GoldenCorpusExpectation.flowType` exists for the rows
 *  that need to say otherwise (see f1-schwab-direction below). */
function defaultFlowType(direction: 'debit' | 'credit'): FlowType {
  return direction === 'credit' ? 'income' : 'expense'
}

/**
 * A row where the current prompt is well-specified enough that the raw
 * model response is assumed to match `expected` exactly — i.e. the
 * pipeline is expected to pass today. `rawOverrides` lets a row set
 * merchant/note/currency/etc. for realism without affecting grading.
 */
function passingRow(
  id: string,
  lang: Locale,
  utterance: string,
  expected: GoldenCorpusExpectation,
  rawOverrides: Record<string, unknown> = {},
  finding?: string,
): GoldenCorpusRow {
  return {
    id,
    finding,
    lang,
    utterance,
    expected,
    rawResponse: {
      ...RAW_DEFAULTS,
      amount: expected.amount,
      // `direction` itself is no longer part of the model's real
      // contract (packages/ai/src/parsedExpenseSchema.ts drops it in
      // favor of `flow_type` — fix-plan item 1.7), but this fixture
      // keeps the key so a row overriding `rawOverrides.direction`
      // (there are none today) would still read naturally; the pipeline
      // itself never looks at it.
      direction: expected.direction,
      flow_type: expected.flowType ?? defaultFlowType(expected.direction),
      is_recurring_suggestion: expected.isRecurringSuggestion,
      recurring_frequency_suggestion: expected.isRecurringSuggestion
        ? (rawOverrides.recurring_frequency_suggestion ?? 'monthly')
        : null,
      ...rawOverrides,
    },
  }
}

// ─── Headline rows — the finding-tied cases named in item 1.1 ─────────────
//
// "the first four rows are the four user-reported parse bugs" (item
// 1.1's spec). Two of the four user-reported bugs (02-ai-parsing-and-scan
// "bug 3" / F3 — rejected scans still open a savable editor, and "bug 4" /
// F9 — confirm-sheet hydration carryover) live entirely in mobile UI code
// (record.tsx / VoiceConfirmModal.tsx), not in this package's parse
// pipeline, so they cannot honestly be encoded as utterance rows here —
// see the `it.todo` pair at the bottom of goldenCorpus.test.ts, which
// names them explicitly so they stay visible in `turbo test` output.
// These four headline rows instead pin the two bugs that ARE parse
// pipeline bugs (F1, F7, F5 — all three fixed at HEAD, guarded here so
// they stay fixed) plus the one still-open pipeline bug the corpus was
// specifically designed to catch (F27's own text: "the only thing that
// would have caught F1 and F5").

export const HEADLINE_ROWS: GoldenCorpusRow[] = [
  // F1 (bug 1) — "investing $300 at Charles Schwab" pre-selected Income.
  // Fixed at HEAD: prompt.ts:20 now carries this exact sentence as a
  // worked example ("...→ direction 'debit'"). This row guards that fix.
  passingRow(
    'f1-schwab-direction',
    'en',
    'I am investing around $300 every single month at Charles Schwab in the S&P 500',
    { direction: 'debit', amount: 300, isRecurringSuggestion: true, flowType: 'transfer_out' },
    { merchant: 'Charles Schwab', note: 'S&P 500', recurring_frequency_suggestion: 'monthly' },
    'F1',
  ),
  // F7 (bug 2) — "in the S&P 500" was captured nowhere; `note` didn't
  // exist on ParsedExpense. Fixed at HEAD: prompt.ts:25 now asks for
  // `note` and parser.ts:83 maps it. Same utterance as above, different
  // assertion (noteContains) — kept as its own row per item 1.1's "first
  // four rows" framing.
  passingRow(
    'f7-schwab-note',
    'en',
    'I am investing around $300 every single month at Charles Schwab in the S&P 500',
    {
      direction: 'debit',
      amount: 300,
      isRecurringSuggestion: true,
      flowType: 'transfer_out',
      noteContains: 'S&P 500',
    },
    { merchant: 'Charles Schwab', note: 'S&P 500', recurring_frequency_suggestion: 'monthly' },
    'F7',
  ),
  // F5 — prompt.ts:17 used to tell the model to silently divide a bare
  // 3-digit retail/food amount by 100 ("450" -> 4.50). Fixed by fix-plan
  // item 1.7: the heuristic is deleted; the model is told to transcribe
  // the number exactly as spoken and, only when genuinely ambiguous, set
  // needs_clarification instead of guessing. This row (and the generic
  // 'en-grocery-450' row below) guard the corrected behavior — a bare
  // $450 retail amount is no longer rescaled to $4.50.
  passingRow(
    'f5-divide-by-100-costco',
    'en',
    'I spent 450 at Costco',
    { direction: 'debit', amount: 450, isRecurringSuggestion: false },
    { merchant: 'Costco', confidence: 0.9 },
    'F5',
  ),
  // F30 — prompt.ts:32's last sentence still tells the model to "lean
  // TRUE if the amount is large and round" when uncertain. Still open at
  // HEAD. A one-off, large, round furniture purchase is exactly the
  // shape that clause was written to flip.
  {
    id: 'f30-lean-true-large-round',
    finding: 'F30',
    lang: 'en',
    utterance: 'I paid twelve hundred dollars for a new couch',
    expected: { direction: 'debit', amount: 1200, isRecurringSuggestion: false },
    rawResponse: {
      ...RAW_DEFAULTS,
      amount: 1200,
      direction: 'debit',
      flow_type: 'expense',
      category_suggestion: 'Furniture',
      is_recurring_suggestion: true,
      recurring_frequency_suggestion: 'monthly',
      confidence: 0.6,
    },
    knownFailing: true,
    knownFailingReason:
      'prompt.ts:32 ("lean TRUE if the amount is large and round... paid") still arms a phantom recurring rule for a one-off purchase. Fix: delete that clause (audit 02-F30\'s proposed fix).',
  },
]

// ─── Generic rows — direction / amount / is_recurring_suggestion coverage ──
//
// All assumed passing today: each utterance uses vocabulary the current
// prompt.ts rules (direction, the recurring category list) already cover
// unambiguously. `en-grocery-450` is the deliberate exception — a bare
// 3-digit round number in a retail context, chosen specifically to pin F5's
// fix. Amounts are otherwise NOT round on one-off purchases (the one case
// F30 still flips).

const EN_ROWS: GoldenCorpusRow[] = [
  // Generic companion to the f5-divide-by-100-costco headline row: same
  // rule (a bare 3-digit retail amount is transcribed exactly, never
  // rescaled by 100), different merchant/utterance, so the fix is pinned
  // by more than one sentence.
  passingRow('en-grocery-450', 'en', 'I spent 450 at the grocery store', {
    direction: 'debit',
    amount: 450,
    isRecurringSuggestion: false,
  }),
  passingRow('en-groceries', 'en', "I spent $23.40 at Trader Joe's on groceries", {
    direction: 'debit',
    amount: 23.4,
    isRecurringSuggestion: false,
  }),
  passingRow('en-lunch', 'en', 'Paid $15.75 for lunch at Chipotle', {
    direction: 'debit',
    amount: 15.75,
    isRecurringSuggestion: false,
  }),
  passingRow('en-gas', 'en', 'Filled up the tank for $42.10 at Shell', {
    direction: 'debit',
    amount: 42.1,
    isRecurringSuggestion: false,
  }),
  passingRow('en-uber', 'en', 'Grabbed an Uber for $18.60 downtown', {
    direction: 'debit',
    amount: 18.6,
    isRecurringSuggestion: false,
  }),
  passingRow('en-movies', 'en', 'Bought movie tickets for $27 at AMC', {
    direction: 'debit',
    amount: 27,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-rent',
    'en',
    'My rent is $1450 due on the first',
    { direction: 'debit', amount: 1450, isRecurringSuggestion: true },
    { category_suggestion: 'Housing' },
  ),
  passingRow(
    'en-netflix',
    'en',
    'Netflix charged me $15.49 this month',
    { direction: 'debit', amount: 15.49, isRecurringSuggestion: true },
    { merchant: 'Netflix', category_suggestion: 'Subscriptions' },
  ),
  passingRow(
    'en-electric',
    'en',
    'Paid my electric bill, $84.32',
    { direction: 'debit', amount: 84.32, isRecurringSuggestion: true },
    { category_suggestion: 'Utilities' },
  ),
  passingRow(
    'en-gym',
    'en',
    'Gym membership renewed for $39.99',
    { direction: 'debit', amount: 39.99, isRecurringSuggestion: true },
    { category_suggestion: 'Fitness' },
  ),
  passingRow(
    'en-paycheck',
    'en',
    'My paycheck came in, $2150.00',
    { direction: 'credit', amount: 2150, isRecurringSuggestion: true },
    { category_suggestion: 'Income', recurring_frequency_suggestion: 'biweekly' },
  ),
  passingRow('en-refund', 'en', 'Amazon refunded me $34.20 for a return', {
    direction: 'credit',
    amount: 34.2,
    isRecurringSuggestion: false,
  }),
  passingRow('en-roommate', 'en', 'Got $75 back from my roommate for utilities', {
    direction: 'credit',
    amount: 75,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-401k',
    'en',
    'I contribute $300 to my 401k every paycheck',
    { direction: 'debit', amount: 300, isRecurringSuggestion: true },
    { category_suggestion: 'Savings & Investing', recurring_frequency_suggestion: 'biweekly' },
  ),
  passingRow('en-atm', 'en', 'Took $60 out of the ATM', {
    direction: 'debit',
    amount: 60,
    isRecurringSuggestion: false,
  }),
  passingRow('en-amex', 'en', 'Paid off $420.55 on my Amex this month', {
    direction: 'debit',
    amount: 420.55,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-car-payment',
    'en',
    'My car payment is $315 a month',
    { direction: 'debit', amount: 315, isRecurringSuggestion: true },
    { category_suggestion: 'Auto Loan' },
  ),
  passingRow('en-coffee', 'en', 'Bought a coffee for $6.25 this morning', {
    direction: 'debit',
    amount: 6.25,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-water',
    'en',
    'Water bill was $52.18',
    { direction: 'debit', amount: 52.18, isRecurringSuggestion: true },
    { category_suggestion: 'Utilities' },
  ),
  passingRow('en-tip', 'en', 'Got a $12 tip from a client', {
    direction: 'credit',
    amount: 12,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-spotify',
    'en',
    'Paid $18.99 for my Spotify Premium',
    { direction: 'debit', amount: 18.99, isRecurringSuggestion: true },
    { merchant: 'Spotify', category_suggestion: 'Subscriptions' },
  ),
  passingRow('en-target', 'en', 'Dropped $95.40 at Target on home stuff', {
    direction: 'debit',
    amount: 95.4,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-dividend',
    'en',
    'My dividend payment came in, $42.13',
    { direction: 'credit', amount: 42.13, isRecurringSuggestion: true },
    { category_suggestion: 'Income' },
  ),
  passingRow('en-donation', 'en', 'Donated $50 to the food bank', {
    direction: 'debit',
    amount: 50,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'en-tuition',
    'en',
    'Tuition payment of $612 went through',
    { direction: 'debit', amount: 612, isRecurringSuggestion: true },
    { category_suggestion: 'Education' },
  ),
]

const FR_ROWS: GoldenCorpusRow[] = [
  passingRow('fr-supermarche', 'fr', "J'ai dépensé 32,50 € au supermarché Carrefour", {
    direction: 'debit',
    amount: 32.5,
    isRecurringSuggestion: false,
  }),
  passingRow('fr-dejeuner', 'fr', 'Payé 14,90 € pour le déjeuner', {
    direction: 'debit',
    amount: 14.9,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'fr-loyer',
    'fr',
    "Mon loyer est de 980 € par mois",
    { direction: 'debit', amount: 980, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Logement' },
  ),
  passingRow(
    'fr-netflix',
    'fr',
    "Netflix m'a prélevé 13,49 €",
    { direction: 'debit', amount: 13.49, isRecurringSuggestion: true },
    { currency: 'EUR', merchant: 'Netflix', category_suggestion: 'Abonnements' },
  ),
  passingRow(
    'fr-salaire',
    'fr',
    "J'ai reçu mon salaire, 2400 €",
    { direction: 'credit', amount: 2400, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Revenu' },
  ),
  passingRow('fr-remboursement', 'fr', 'Remboursement Amazon de 21,30 €', {
    direction: 'credit',
    amount: 21.3,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'fr-electricite',
    'fr',
    "Facture d'électricité de 65,20 €",
    { direction: 'debit', amount: 65.2, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Charges' },
  ),
  passingRow('fr-distributeur', 'fr', "J'ai retiré 40 € au distributeur", {
    direction: 'debit',
    amount: 40,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'fr-salle-de-sport',
    'fr',
    'Abonnement salle de sport, 29,99 €',
    { direction: 'debit', amount: 29.99, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Sport' },
  ),
  passingRow('fr-cafe', 'fr', 'Café à 3,80 € ce matin', {
    direction: 'debit',
    amount: 3.8,
    isRecurringSuggestion: false,
  }),
  passingRow("fr-uber", 'fr', "J'ai payé 45,60 € pour un Uber", {
    direction: 'debit',
    amount: 45.6,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'fr-voiture',
    'fr',
    'Paiement de la voiture, 250 € par mois',
    { direction: 'debit', amount: 250, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Auto' },
  ),
]

const ES_ROWS: GoldenCorpusRow[] = [
  passingRow('es-supermercado', 'es', 'Gasté 28,40 € en el supermercado', {
    direction: 'debit',
    amount: 28.4,
    isRecurringSuggestion: false,
  }),
  passingRow('es-almuerzo', 'es', 'Pagué 12,75 € por el almuerzo', {
    direction: 'debit',
    amount: 12.75,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'es-alquiler',
    'es',
    'Mi alquiler es de 850 € al mes',
    { direction: 'debit', amount: 850, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Vivienda' },
  ),
  passingRow(
    'es-netflix',
    'es',
    'Netflix me cobró 12,99 €',
    { direction: 'debit', amount: 12.99, isRecurringSuggestion: true },
    { currency: 'EUR', merchant: 'Netflix', category_suggestion: 'Suscripciones' },
  ),
  passingRow(
    'es-salario',
    'es',
    'Recibí mi salario, 1900 €',
    { direction: 'credit', amount: 1900, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Ingresos' },
  ),
  passingRow('es-reembolso', 'es', 'Reembolso de Amazon de 19,50 €', {
    direction: 'credit',
    amount: 19.5,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'es-electricidad',
    'es',
    'Factura de electricidad, 58,30 €',
    { direction: 'debit', amount: 58.3, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Servicios' },
  ),
  passingRow('es-cajero', 'es', 'Saqué 50 € del cajero', {
    direction: 'debit',
    amount: 50,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'es-gimnasio',
    'es',
    'Membresía del gimnasio, 34,99 €',
    { direction: 'debit', amount: 34.99, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Deporte' },
  ),
  passingRow('es-cafe', 'es', 'Café por 3,50 € esta mañana', {
    direction: 'debit',
    amount: 3.5,
    isRecurringSuggestion: false,
  }),
  passingRow('es-uber', 'es', 'Pagué 38,20 € por un Uber', {
    direction: 'debit',
    amount: 38.2,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'es-carro',
    'es',
    'Pago del carro, 280 € al mes',
    { direction: 'debit', amount: 280, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Auto' },
  ),
]

const PT_ROWS: GoldenCorpusRow[] = [
  passingRow('pt-supermercado', 'pt', 'Gastei 25,60 € no supermercado', {
    direction: 'debit',
    amount: 25.6,
    isRecurringSuggestion: false,
  }),
  passingRow('pt-almoco', 'pt', 'Paguei 11,40 € no almoço', {
    direction: 'debit',
    amount: 11.4,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'pt-aluguel',
    'pt',
    'Meu aluguel é de 900 € por mês',
    { direction: 'debit', amount: 900, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Moradia' },
  ),
  passingRow(
    'pt-netflix',
    'pt',
    'A Netflix me cobrou 14,99 €',
    { direction: 'debit', amount: 14.99, isRecurringSuggestion: true },
    { currency: 'EUR', merchant: 'Netflix', category_suggestion: 'Assinaturas' },
  ),
  passingRow(
    'pt-salario',
    'pt',
    'Recebi meu salário, 2100 €',
    { direction: 'credit', amount: 2100, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Renda' },
  ),
  passingRow('pt-reembolso', 'pt', 'Reembolso da Amazon de 20,10 €', {
    direction: 'credit',
    amount: 20.1,
    isRecurringSuggestion: false,
  }),
  passingRow(
    'pt-luz',
    'pt',
    'Conta de luz, 60,45 €',
    { direction: 'debit', amount: 60.45, isRecurringSuggestion: true },
    { currency: 'EUR', category_suggestion: 'Utilidades' },
  ),
  passingRow('pt-caixa', 'pt', 'Saquei 45 € no caixa eletrônico', {
    direction: 'debit',
    amount: 45,
    isRecurringSuggestion: false,
  }),
]

export const GOLDEN_CORPUS: GoldenCorpusRow[] = [
  ...HEADLINE_ROWS,
  ...EN_ROWS,
  ...FR_ROWS,
  ...ES_ROWS,
  ...PT_ROWS,
]
