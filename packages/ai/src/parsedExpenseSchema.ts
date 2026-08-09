// The `response_format: { type: 'json_schema' }` shape for both parse
// routes — fix-plan item 1.7, part 3 ("Switch to response_format:
// { type: 'json_schema' } so the shape is enforced by the API rather than
// by prose"). Built from the exact same enum lists `validateParsedExpense`
// checks against (`PAYMENT_METHOD_VALUES`/`FLOW_TYPE_VALUES`/
// `RECURRING_FREQUENCY_VALUES`), so the schema and the validator can never
// describe two different sets of legal values — this is enforcement at the
// API boundary, on top of the validator, not a replacement for it: a
// model can still return an out-of-range `confidence` or a > 1e9 `amount`
// under this schema, which is exactly what `validateParsedExpense` still
// exists to reject.
//
// `direction` is deliberately not a property here — fix-plan item 1.7,
// part 1: "the model classifies intent; code decides the sign." The
// model returns `flow_type`; `deriveDirectionFromFlowType`
// (validateParsedExpense.ts) is the only place `direction` gets set.
//
// OpenAI's Structured Outputs strict mode requires every property to be
// listed in `required` (nullable fields express optionality via a
// `["type", "null"]` union instead of omission) and `additionalProperties:
// false` on every object level.

import {
  PAYMENT_METHOD_VALUES,
  FLOW_TYPE_VALUES,
  RECURRING_FREQUENCY_VALUES,
} from './validateParsedExpense'

export const PARSED_EXPENSE_JSON_SCHEMA = {
  name: 'parsed_expense',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      amount: { type: 'number', description: 'Positive amount, no currency symbol, at most 2 decimal places.' },
      currency: { type: 'string', description: 'ISO 4217 currency code, e.g. USD.' },
      flow_type: { type: 'string', enum: [...FLOW_TYPE_VALUES] },
      merchant: { type: ['string', 'null'] },
      merchant_domain: { type: ['string', 'null'] },
      note: { type: ['string', 'null'] },
      category_suggestion: { type: ['string', 'null'] },
      payment_method: { type: ['string', 'null'], enum: [...PAYMENT_METHOD_VALUES, null] },
      transacted_at: { type: 'string', description: 'ISO 8601 datetime.' },
      confidence: { type: 'number', description: '0.0 to 1.0.' },
      needs_clarification: { type: 'boolean' },
      clarifying_question: { type: ['string', 'null'] },
      is_recurring_suggestion: { type: 'boolean' },
      recurring_frequency_suggestion: { type: ['string', 'null'], enum: [...RECURRING_FREQUENCY_VALUES, null] },
    },
    required: [
      'amount',
      'currency',
      'flow_type',
      'merchant',
      'merchant_domain',
      'note',
      'category_suggestion',
      'payment_method',
      'transacted_at',
      'confidence',
      'needs_clarification',
      'clarifying_question',
      'is_recurring_suggestion',
      'recurring_frequency_suggestion',
    ],
  },
} as const
