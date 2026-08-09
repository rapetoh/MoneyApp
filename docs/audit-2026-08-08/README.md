# 360° production-readiness audit — 2026-08-08

Full audit of the Murmur application, commissioned after a manual test session on 2026-08-08 surfaced thirteen defects in roughly thirty minutes.

**Result: 314 verified findings — 34 Critical, 99 High, 130 Medium, 51 Low. The application is not production-ready.**

No application code has been changed. This folder is a report, not a fix.

## Start here

1. **[09-EXECUTIVE-SUMMARY.md](09-EXECUTIVE-SUMMARY.md)** — the verdict, the five root causes, and the 23 distinct Critical defects. Read this first.
2. **[00-YOUR-REPORTED-ISSUES.md](00-YOUR-REPORTED-ISSUES.md)** — your thirteen findings, each verified against the production database. All thirteen were real.
3. **[10-FIX-PLAN.md](10-FIX-PLAN.md)** — the work order, sequenced by dependency rather than severity.

## Domain reports

| File | Covers | Findings |
|---|---|---|
| [01-mobile-ui-and-layout.md](01-mobile-ui-and-layout.md) | Safe areas, bottom sheets, keyboard handling, fonts, touch targets | 37 |
| [02-ai-parsing-and-scan.md](02-ai-parsing-and-scan.md) | Prompts, output validation, scan rejection, Ask Murmur | 35 |
| [03-recurring-system.md](03-recurring-system.md) | The recurring subsystem, end to end | 38 |
| [04-dates-timezones-calendar.md](04-dates-timezones-calendar.md) | Every date computation in the repository | 34 |
| [05-money-math-and-forecasts.md](05-money-math-and-forecasts.md) | Every aggregate, with a complete formula table | 36 |
| [06-data-sync-and-security.md](06-data-sync-and-security.md) | Schema, sync engine, RLS, auth, secrets | 39 |
| [07-architecture-and-duplication.md](07-architecture-and-duplication.md) | Why these defects keep recurring | 44 |
| [08-product-sweep-every-screen.md](08-product-sweep-every-screen.md) | Screen by screen: states, copy, dead ends | 51 |

## Method

Eight independent domain auditors read the codebase, each writing its own report. A second auditor then re-checked every finding in every report against the source, with the explicit goal of **refuting** it — deleting false claims, correcting wrong line numbers and mechanisms, and adjusting inflated severities. Each file ends with a `## Refuted during verification` section recording what was removed and why; 64 sub-claims were corrected this way rather than silently dropped.

Load-bearing facts were checked directly against the live production database (Supabase project `ohaqhwampmyoeaopdybd`) rather than inferred from code — including the empty `recurring_rules` table, the empty realtime publication, the RLS policies, the `note` column being NULL on every row ever written, and every profile carrying `timezone='UTC'`.

## Needs action independent of everything else

A **Supabase secret key is stored in plaintext in the production database**, inside `cron.job.command` for the `generate-recurring-daily` job. Rotate it and move it to Vault. See Stage 0 of the fix plan.
