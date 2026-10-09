# Rollover, goals, learned categories (Oct 8 2026)

From the Monarch comparison (docs/monarch-vs-murmur.html): the gaps worth closing without bank sync.

## Budget rollover (migration 040)

- Switch in the budget editor (phone and web). Off by default.
- Each past period since the budget started carries `amount - spent` into the current one (over and under).
- `available = amount + carryover` drives every ring, "of $X", Ask Murmur and budget notifications.
- Editing a budget creates a new row; `rollover_carry_in` hands the old row's carry to the new one (`inheritedCarry`), so edits never drop money.
- Currency change converts `rollover_carry_in`.
- Logic: `packages/shared/src/domain/budget.ts` (`budgetStatus`, `inheritedCarry`), tests in `budget.test.ts`.

## Savings goals (migration 042)

- Budgets tab (phone) and Budgets page (web): name, target, optional date.
- Progress = contributions (add money / take out). No bank, so recorded, never inferred.
- Pace against a straight line from creation to date: Ahead / On track / Behind / Past date / Reached, plus "$X a month to finish by ...".
- Logic: `packages/shared/src/domain/goals.ts` (7 tests). Phone: `useGoals.ts`, `GoalsSection.tsx`. Web: `components/GoalsPanel.tsx`.
- Currency change converts goals and contributions.

## Learned categories (migration 041)

- Move a saved expense to another category (phone or web) and Murmur remembers that merchant.
- Next capture from it (voice, scan, bank notification, Apple Pay, Siri, Watch, CSV) files there before the AI's guess.
- Snackbar says what was learned, with Undo. Settings > Learned categories lists and forgets rules.
- One key per merchant however the bank spells it (`merchantKey`: cleaned descriptor, letters and digits only).
- Logic: `packages/shared/src/domain/merchantRules.ts`; phone `src/services/merchantRules.ts` (server + device copy in `sync_meta`).

## Also fixed

- Quick-glance amounts read "$739.3" (compact notation keeps a decimal under 1,000). New `precision: 'whole'` ("$739") on Today, Budgets and widgets.
- Undo snackbar allows two lines (the "learned" sentence was cut off).
- Dialogs: a tap outside while the keyboard is up (or just closing) now only closes the keyboard; it used to close the dialog and lose what was typed (`CenterModal.tsx`).
- Budgets scroll view uses `keyboardShouldPersistTaps="handled"`: the goal dialogs render inside it, and the default swallowed the first tap on Save.
- Bank transfer codes (PPD, ACH, DES:, INDN:, CO ID:) stripped from descriptors; the import batch names the payer for money coming in ("ACME CORP PAYROLL PPD ID: 1234" is Acme Corp).

## Verified (Oct 8 2026, iOS 27 simulator + production web)

Widget gallery and home screen, Speak and Type taps (cold start), learned rule applied to a new Apple Pay capture, goal create / add money / rename, rollover on, a month carried (+$800), edit keeps the carry, CSV import of a Chase file (duplicate held back, merchants and categories named), web budgets and a web import of a European-format file.
