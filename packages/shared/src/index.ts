// Types
export * from './types/database.types'
export * from './types/transaction'
export * from './types/category'
export * from './types/budget'
export * from './types/profile'
export * from './types/sync'
export * from './types/ai'
export * from './types/recurring'

// Utils
export * from './utils/currency'
export * from './utils/period'
export * from './utils/fx'
export * from './utils/validation'

// Utils — merchant avatar color, merchant-logo domain guessing, and
// category-tint derivation (fix-plan 4.4, one copy for both apps)
export * from './utils/color'

// Domain — money aggregation (spend/income/transfers/saved, one definition)
export * from './domain/money'

// Domain — the one export-assembly module (fix-plan 2.15)
export * from './domain/export'

// Domain — the one forecast + pattern-detection modules (fix-plan 2.11)
export * from './domain/forecast'
export * from './domain/patterns'

// Domain — the one budget window and budget status (fix-plan 2.5)
export * from './domain/budget'

// Domain — the one recurrence engine (next-occurrence, windowing, cost
// normalizers) and the one pattern detector, fix-plan 1.5
export * from './domain/recurrence'
export * from './domain/recurringPatternDetector'

// Domain — the one source-label map, fix-plan 2.12
export * from './domain/source'

// Domain — the one category-suggestion resolver, fix-plan 2.9(d)
export * from './domain/categoryResolver'

// i18n
export * from './i18n'

// Brand
export * from './brand'

// Plus entitlement
export * from './plus'

// Ask Murmur conversation persistence (web thread + mobile result card)
export * from './askStorage'
// Ask Murmur entry insights — deterministic, runs on the client (docs/ask-murmur/SPEC.md §3.3).
export * from './domain/askInsights'
