# Per-category budgets on mobile — Aug 16, 2026

**Owner report:** set a Food & Dining budget on the web app; the phone never
showed it after repeated refreshes (account: Gadget Maison).

**Root cause (not a sync bug):** the phone had no concept of per-category
budgets. `useActiveBudget` fetched only the overall budget
(`category_id IS NULL`, one row) and the Budgets tab rendered a "By
category — coming soon" placeholder. The web Budgets page has created and
rendered per-category budgets (one active per category; a new one
deactivates the previous; delete = deactivate) for months. The row was in
the database and correct (`$200/month · Food & Dining · active`); mobile
simply never loaded it.

**Fix (mobile, feature parity with web):**
- `useCategoryBudgets(userId)` in `src/hooks/useBudget.ts` — loads every
  active budget with a `category_id`, through the app-wide query cache;
  `saveCategoryBudget` (same one-active-per-category rule as web) and
  `removeCategoryBudget` (deactivate). Emits `DataEvents.emitBudget` so
  every screen updates.
- Budgets tab "By category" section: one row per category budget — colour
  dot + name + period, spent / cap, a pace bar, and an on-pace / tight /
  over line computed by the same shared `budgetStatus` the hero and the
  web page use (identical figures across surfaces). Tap a row → Edit /
  Delete. Empty state links to "Add a category budget". Pull-to-refresh
  refetches these too.
- `BudgetEditorModal` gains an optional "Applies to" scope picker (All
  spending / a category chip). The Budgets tab passes `categories`; the
  "+" pill opens it for a new budget; editing an existing one locks the
  scope. Settings still uses it overall-only (unchanged).
- i18n: `budgets.applies_to`, `budgets.scope_overall`,
  `budgets.by_category_empty`, `budgets.add_category_budget`,
  `budgets.remove_confirm` in en/fr/es/pt; `budgets.by_category_coming_soon`
  removed.

**Not changed:** the Today budget line and Ask Murmur's BUDGET block still
use the overall budget (`useActiveBudget`) — per-category budgets in Ask
are the Ask rebuild's territory (docs/ask-murmur/SPEC.md).

**Ships in:** the next TestFlight build (native app change; server unaffected).
