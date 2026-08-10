// ESLint flat config for the Murmur monorepo.
//
// This file exists to hold down fixes, not to police style — see
// docs/audit-2026-08-08/10-FIX-PLAN.md item 1.1. Each `no-restricted-syntax`
// entry below targets a pattern the audit found duplicated across the
// codebase (nine hand-rolled month windows, three next-occurrence
// functions, ...). Every entry ships at severity 'off' until the plan
// item that owns the corresponding primitive lands — flipping a single
// entry to 'error' is how that item is closed out. Do not flip one early:
// the rule will immediately fail on every pre-existing call site the
// primitive hasn't replaced yet.
//
// `PERIOD_RESTRICTIONS` (fix-plan 1.3) is the first of these to flip, via
// the `local/period-restrictions` alias below — new code fails the build
// on a local date getter from here on. The pre-existing call sites this
// item's own surfaces list didn't reach are exempted file-by-file (own
// file: an inline `eslint-disable` at the top; a file outside this
// item's ownership: a scoped override at the bottom of this file), each
// marked "Stage 2 (2.4/2.14) migration pending" so the remaining debt
// stays explicit and greppable rather than silently re-widening the
// `off` list.
//
// No other rule categories (eslint:recommended, typescript-eslint
// recommended, etc.) are enabled here. Turning those on across a
// previously-unlinted codebase is its own cleanup item, not part of 1.1.

import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import nextPlugin from '@next/eslint-plugin-next'
import { builtinRules } from 'eslint/use-at-your-own-risk'

// `period-restrictions` is the built-in `no-restricted-syntax` rule,
// re-exposed under a second name via ESLint's own documented
// flat-config escape hatch (`eslint/use-at-your-own-risk`'s
// `builtinRules` map — see "Migrate to flat config" in the ESLint docs).
// Needed because `PERIOD_RESTRICTIONS` (fix-plan 1.3, this item) must
// carry a severity *independent* of `MONEY_RESTRICTIONS` (1.4) and
// `CLIENT_BOUNDARY_RESTRICTIONS` (2.4) within the very same file set
// (apps/web, apps/mobile) — and, per the Tier-3 note below, one
// `no-restricted-syntax` key on one config object can only ever carry
// one severity for every selector inside it. Aliasing the rule under
// its own name gives 1.3 its own switch without disturbing the other
// two, which correctly stay 'off' until their own items land.
const localRules = {
  rules: {
    'period-restrictions': builtinRules.get('no-restricted-syntax'),
    // See the `MOBILE_CLEARANCE_RESTRICTIONS` comment below for why the
    // `paddingBottom` selector needs this same independent-severity
    // treatment, split off from the rest of `MOBILE_PRESENTATION_RESTRICTIONS`.
    'mobile-clearance-restrictions': builtinRules.get('no-restricted-syntax'),
    // See `MOBILE_I18N_RESTRICTIONS`'s own comment for why this needs the
    // same independent-severity alias.
    'mobile-i18n-restrictions': builtinRules.get('no-restricted-syntax'),
    // See `MOBILE_PRICE_RESTRICTIONS`'s own comment — same independent-
    // severity need, scoped even narrower (apps/mobile/app/more/** only,
    // not all of apps/mobile).
    'mobile-price-restrictions': builtinRules.get('no-restricted-syntax'),
    // See `MOBILE_ENV_RESTRICTIONS`'s own comment — same independent-
    // severity need (the build-#6 crash class: computed process.env reads).
    'mobile-env-restrictions': builtinRules.get('no-restricted-syntax'),
  },
}

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.expo/**',
  '**/.expo-shared/**',
  '**/coverage/**',
  '**/ios/**',
  '**/android/**',
  '**/*.config.js',
  '**/*.config.mjs',
  '**/*.config.cjs',
]

// --- 1.3: one definition of "a day", "a week" and "a month" ---------------
// Owner: packages/shared/src/utils/period.ts. Every other file must go
// through that module instead of hand-rolling calendar math.
const PERIOD_RESTRICTIONS = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length>=2]",
    message:
      'Multi-argument `new Date(...)` hand-rolls calendar math (audit 04-F4/04-F10/...). Use packages/shared/src/utils/period.ts once item 1.3 lands.',
  },
  {
    selector:
      "MemberExpression[property.name=/^(getMonth|getDate|getDay|getHours|setMonth|setDate|setFullYear)$/]",
    message:
      'Raw Date getter/setter hand-rolls calendar math (audit 04-F4/04-F10/...). Use packages/shared/src/utils/period.ts once item 1.3 lands.',
  },
  {
    selector:
      "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']",
    message:
      '`.toISOString().slice(0, 10)` computes a UTC day, not the user\'s local day (audit 04-F4). Use packages/shared/src/utils/period.ts once item 1.3 lands.',
  },
]

// --- 1.4: one money and aggregation module ---------------------------------
// A bare `.amount` read inside a reduce/`+=` skips FX conversion and the
// shared "what counts as spend" rules (audit 05-F3/05-F19/...).
const MONEY_RESTRICTIONS = [
  {
    selector: "CallExpression[callee.property.name='reduce'] MemberExpression[property.name='amount']",
    message:
      'Aggregating `.amount` directly inside a reduce skips FX conversion (audit 05-F3/07-F...). Use packages/shared/src/utils/money.ts once item 1.4 lands.',
  },
  {
    selector: "AssignmentExpression[operator='+='] MemberExpression[property.name='amount']",
    message:
      'Accumulating `.amount` directly with `+=` skips FX conversion (audit 05-F3/07-F...). Use packages/shared/src/utils/money.ts once item 1.4 lands.',
  },
]

// --- 2.4: a Date in a 'use client' component's prop type -------------------
// Passing a Date instance across the RSC/client boundary serialises
// unpredictably; the boundary must pass an ISO string instead.
const CLIENT_BOUNDARY_RESTRICTIONS = [
  {
    selector:
      "Program:has(ExpressionStatement[expression.value='use client']) TSTypeReference[typeName.name='Date']",
    message:
      "`Date` in a 'use client' component's prop type crosses the RSC boundary unpredictably (audit 04-F...). Pass an ISO string once item 2.4 lands.",
  },
]

// --- 1.8/2.14: tab-bar / safe-area clearance literals -----------------------
// Given its own rule name (`local/mobile-clearance-restrictions`) rather
// than sharing `no-restricted-syntax` with `MOBILE_PRESENTATION_RESTRICTIONS`
// below — ESLint flat config merges multiple config objects matching the
// same files by rule *key*, not by selector, so a shared key can only ever
// carry one severity for every selector inside it (same reason
// `period-restrictions` got its own alias). This selector is independently
// safe to flip to 'error' now that item 2.14 has swept the ten
// `paddingBottom >= 100` sites (fourteen call sites total across 1.8+2.14)
// onto `useTabBarClearance()` / `insets.bottom + 24` — the `<Text>` i18n
// selector below is a different item (Stage 4) with its own, much larger,
// remaining surface, so it stays on its own switch and stays 'off'.
const MOBILE_CLEARANCE_RESTRICTIONS = [
  {
    selector: "Property[key.name='paddingBottom'] > Literal[value>=100]",
    message:
      'A `paddingBottom` >= 100 is almost always a hand-tuned safe-area/keyboard workaround (audit 01-F13). Use `useTabBarClearance()` / `insets.bottom + 24` from src/theme/chrome.ts (added by item 1.8).',
  },
]

// --- Stage 4.2: mobile i18n --------------------------------------------------
// Given its own alias (`local/mobile-i18n-restrictions`) for the same reason
// `period-restrictions` and `mobile-clearance-restrictions` did: it needs a
// severity independent of `MONEY_RESTRICTIONS`/`CLIENT_BOUNDARY_RESTRICTIONS`,
// which correctly stay 'off' in the same file set until their own items land.
//
// The value pattern requires a Latin letter, not just non-whitespace — a
// bare `/\S/` (the audit's original 01-F29/08-F48 proposal) also matched
// currency glyphs (`$`), checkmarks (`✓`), emoji (`💸`), stepper `+`/`−`,
// percent signs, digit placeholders and the `·`/`/`/`–` separators used
// throughout the app to join two already-translated `t()` calls — 33 of the
// 37 matches when this was first tried were exactly that, not English
// words. None of those need a translator; requiring a letter keeps the rule
// aimed at what item 4.2 actually means by "untranslated literal" without
// permanently red-lining the build on punctuation.
const MOBILE_I18N_RESTRICTIONS = [
  {
    selector: "JSXElement[openingElement.name.name='Text'] > JSXText[value=/[A-Za-zÀ-ÖØ-öø-ÿ]/]",
    message:
      'A string literal as `<Text>` children bypasses i18n (fix-plan 4.2). Route it through t().',
  },
]

// --- 3.1 regression guard: no hardcoded price strings under more/ ----------
// fix-plan 3.1: the paywall used to show "$4.99/$39" — hardcoded in
// dollars for every storefront, and it contradicted the locked $3.99/
// $29.99 decision in docs/PLAN.md (audit 3.1.2, an automatic App Store
// review rejection). The fix (this item) deleted the pricing UI outright
// — apps/mobile/app/more/paywall.tsx now describes Plus without a price,
// since there's no purchase flow yet to quote one for — so this rule has
// nothing to catch today; it exists purely to stop the same literal from
// coming back the next time someone wires up a real purchase flow here
// without going through a locale/storefront-aware price formatter.
// Scoped to apps/mobile/app/more/** (not all of apps/mobile) because
// that's this item's own surface — paywall.tsx plus its siblings in the
// same route group.
// Computed access to process.env is invisible to Expo's EXPO_PUBLIC_*
// build-time inlining: `process.env[name]` reads undefined in every
// release binary even when the profile sets the var. TestFlight build #6
// crashed on launch from exactly this (supabase.ts's requireEnv). Only
// literal member access (`process.env.EXPO_PUBLIC_X`) is inlined.
const MOBILE_ENV_RESTRICTIONS = [
  {
    selector: "MemberExpression[computed=true][object.object.name='process'][object.property.name='env']",
    message:
      'Computed process.env access is never inlined by Expo — in a release binary this reads undefined even when the build profile sets the var (TestFlight build #6 crashed on launch from this). Reference EXPO_PUBLIC_* vars literally: process.env.EXPO_PUBLIC_X.',
  },
]

const MOBILE_PRICE_RESTRICTIONS = [
  {
    selector: 'Literal[value=/\\$\\d/]',
    message:
      'A hardcoded "$" + digit price string regressed fix-plan 3.1/3.1.2 (the paywall\'s $4.99/$39 that contradicted docs/PLAN.md\'s locked $3.99/$29.99 and was hardcoded in dollars for every storefront). Prices come from a locale/storefront-aware formatter, never a literal.',
  },
  {
    selector: 'JSXText[value=/\\$\\d/]',
    message:
      'A hardcoded "$" + digit price string regressed fix-plan 3.1/3.1.2 (the paywall\'s $4.99/$39 that contradicted docs/PLAN.md\'s locked $3.99/$29.99 and was hardcoded in dollars for every storefront). Prices come from a locale/storefront-aware formatter, never a literal.',
  },
  {
    selector: 'TemplateElement[value.raw=/\\$\\d/]',
    message:
      'A hardcoded "$" + digit price string regressed fix-plan 3.1/3.1.2 (the paywall\'s $4.99/$39 that contradicted docs/PLAN.md\'s locked $3.99/$29.99 and was hardcoded in dollars for every storefront). Prices come from a locale/storefront-aware formatter, never a literal.',
  },
]

export default tseslint.config(
  { ignores: IGNORES },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2021,
      },
    },
    // Registered so pre-existing `eslint-disable` comments referencing
    // these plugins' rules resolve. None of their rules are enabled here —
    // that's a separate cleanup, not part of 1.1.
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
  },
  // Tier 1: packages/** (period.ts itself is exempt — it's the primitive).
  {
    files: ['packages/**/*.{ts,tsx}'],
    ignores: ['packages/shared/src/utils/period.ts'],
    plugins: { local: localRules },
    rules: {
      'local/period-restrictions': ['error', ...PERIOD_RESTRICTIONS],
    },
  },
  // Tier 2: apps/web + apps/desktop (non-mobile; 'use client' only exists here).
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/desktop/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, local: localRules },
    rules: {
      'local/period-restrictions': ['error', ...PERIOD_RESTRICTIONS],
      'no-restricted-syntax': ['off', ...MONEY_RESTRICTIONS, ...CLIENT_BOUNDARY_RESTRICTIONS],
    },
  },
  // Tier 3: apps/mobile (RN — adds the presentation-primitive rules).
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { local: localRules },
    rules: {
      'local/period-restrictions': ['error', ...PERIOD_RESTRICTIONS],
      // Item 2.14's own switch — flipped now that the paddingBottom sweep
      // is clean (verified by grep across apps/mobile immediately before
      // this flip; see the item's commit).
      'local/mobile-clearance-restrictions': ['error', ...MOBILE_CLEARANCE_RESTRICTIONS],
      // Item 4.2's own switch — flipped now that the letter-bearing sweep
      // is clean (four genuine hits fixed: RecurringToggle's "AI" badge,
      // SyncFailureBanner's "Retry"/"Discard"/"Retry all" — see the item's
      // commit). MONEY_RESTRICTIONS/CLIENT_BOUNDARY_RESTRICTIONS stay 'off'
      // under the shared key below; their own items haven't landed.
      'local/mobile-i18n-restrictions': ['error', ...MOBILE_I18N_RESTRICTIONS],
      'local/mobile-env-restrictions': ['error', ...MOBILE_ENV_RESTRICTIONS],
      'no-restricted-syntax': ['off', ...MONEY_RESTRICTIONS, ...CLIENT_BOUNDARY_RESTRICTIONS],
    },
  },
  // Tier 3a: apps/mobile/app/more/** — fix-plan 3.1's own surface
  // (paywall.tsx and its route-group siblings). A narrower override on
  // top of Tier 3 above; its own key (`local/mobile-price-restrictions`)
  // so it doesn't collide with Tier 3's shared `no-restricted-syntax` key
  // (still 'off' for MONEY_RESTRICTIONS/CLIENT_BOUNDARY_RESTRICTIONS —
  // unrelated items) — same independent-severity pattern as every other
  // `local/*-restrictions` alias in this file.
  {
    files: ['apps/mobile/app/more/**/*.{ts,tsx}'],
    plugins: { local: localRules },
    rules: {
      'local/mobile-price-restrictions': ['error', ...MOBILE_PRICE_RESTRICTIONS],
    },
  },
  // --- 1.3 Stage-2 debt: pre-existing call sites outside this item's own
  // surfaces list (apps/mobile/src/components/HistoryHeatmap.tsx's
  // weekday labels, apps/web/src/lib/monthIso.ts, dashboard/page.tsx +
  // transactions/page.tsx's month bounds, packages/shared/src/utils/fx.ts,
  // apps/mobile/src/hooks/useTransactions.ts's `local_day` write). Every
  // file below still hand-rolls calendar math and is owned by a later
  // item (2.3/2.4/2.5/2.10/2.11/2.14/2.15 — the calendar grid, budgets,
  // Ask Murmur and export rewrites), not this one. Files this item's own
  // ownership *does* cover carry the same exemption as an inline
  // `eslint-disable` at their own top instead of an entry here — this
  // block is only for files outside that ownership, where a config-level
  // override is how the debt gets marked without editing a file another
  // item owns. (`packages/ai/src/advisor.ts` carried this exemption too,
  // until fix-plan 2.11 deleted the file outright — zero callers.)
  //
  // `apps/mobile/app/(tabs)/index.tsx` graduated off this list (Stage 2
  // verifier pass): `isSameDay`/`mondayIndex`/`weeklySpendBars`/
  // `daysLeftInMonth` are gone, replaced by `period.ts`'s `localParts`/
  // `localDay`/`monthBounds`/`daysBetween`/`addDays`, all `tz`-aware.
  //
  // `apps/mobile/src/services/askMurmurClient.ts` graduated off this list
  // too (fix-plan 2.10): its cutoff-date `Date#setDate`/`Date#getDate`
  // pair is gone, replaced by `period.ts`'s `localParts`/`addDays`/
  // `civilDateTimeToInstant`.
  {
    files: ['apps/mobile/app/more/transactions.tsx'],
    plugins: { local: localRules },
    rules: {
      // Stage 2 (2.4/2.14) migration pending.
      'local/period-restrictions': 'off',
    },
  },
)
