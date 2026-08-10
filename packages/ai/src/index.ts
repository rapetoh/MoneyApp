// Client-safe entry. Imports from this barrel are bundled into the
// mobile app, so nothing here may pull in Node-only modules. The
// Ask-Murmur prompt builder, validators, and sandbox tools live behind
// `@voice-expense/ai/server` instead.

export { parseExpenseLocally } from './localParser'
export { parseExpense, clearParseCache } from './parser'
export { parseScan } from './scanParser'
export type { ScanType, ScanOptions, ScanResult } from './scanParser'
export { getPrompt, getScanPrompt } from './prompt'

// The typed parse boundary (fix-plan item 1.7). Client-safe — no Node-only
// APIs — so both `apps/web`'s parse routes and the mobile-bundled
// `parser.ts`/`scanParser.ts` import it from here.
export {
  validateParsedExpense,
  assertParsedExpense,
  validateTransactionWriteFields,
  isParseRejection,
  deriveDirectionFromFlowType,
  ParseValidationError,
  DEFAULT_MAX_NOTE_LENGTH,
  ISO_4217_CODES,
  PAYMENT_METHOD_VALUES,
  TRANSACTION_DIRECTION_VALUES,
  RECURRING_FREQUENCY_VALUES,
  FLOW_TYPE_VALUES,
} from './validateParsedExpense'
export type { ValidateParsedExpenseOptions, TransactionWriteFields } from './validateParsedExpense'
export { PARSED_EXPENSE_JSON_SCHEMA } from './parsedExpenseSchema'
