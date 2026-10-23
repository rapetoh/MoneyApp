# CSV and PDF statement import (CSV Oct 8 2026, PDF Oct 23 2026)

Bring history in from a bank, card, Mint, Monarch, YNAB or a spreadsheet. Phone: Settings > Import from a file. Web: sidebar > Import.

## What it decides from the file

| Question | How |
|---|---|
| Delimiter | `,` `;` or tab, most frequent in the first lines |
| Header row? | First row has no date + amount |
| Columns | Header words (EN/FR/ES/PT), then the values |
| One amount or money out / money in | Header words; pair wins |
| Date order (03/04) | Any part > 12 decides; else language (EN month first) |
| Decimal mark | `12,50` vs `12.50` in the amount cells |
| Signs | Both signs present = negative is spending; else all spending |

Everything is shown and editable before saving.

## What it does with each row

```
row ──► merchant named by AI (batch, same rules as voice) ──► category:
        file category > learned rule > AI pick > merchant keywords
     ──► transaction source='import', dated local noon, profile currency
```

- Already in Murmur: same amount + direction within 2 days is held back (each existing row answers for one). Re-importing a file adds nothing. Can be overridden.
- Rows without date or amount are skipped and counted.
- Imports do not count as "logging" for reminders or win-back notifications.

## Files

| Piece | File |
|---|---|
| Reading, columns, dates, amounts, duplicates, row to transaction | `packages/shared/src/domain/csvImport.ts` (39 tests) |
| Merchant batch prompt + validation | `packages/ai/src/merchantBatch.ts` |
| Batch client | `packages/ai/src/identifyMerchants.ts` |
| Endpoint | `apps/web/src/app/api/ai/identify-merchants/route.ts` (40 per call, 120 calls/hour) |
| Phone | `apps/mobile/app/more/import.tsx`, `apps/mobile/src/services/csvImport.ts` |
| Web | `apps/web/src/app/dashboard/import/page.tsx` |
| DB | migration 043 (`source = 'import'`) |

Writes go to the server in chunks of 200; the phone keeps its copy as already synced, and anything that cannot be sent is queued like a normal new transaction.

## PDF statements (web, Oct 23 2026)

Choose one or many bank or card statements (a whole year at once) on the web Import page.

```
PDF ──► /api/ai/parse-statement (one per call, gpt-4.1-mini reads text and scans)
    ──► validateStatementRows (real dates 2000..today, amount > 0, debit/credit)
    ──► same pipeline as a CSV: names, logos, categories, duplicates, save
```

| Rule | Why |
|---|---|
| Card payments and moves between own accounts are flagged and left out (checkbox to include) | a checking + card statement would count spending twice |
| Year taken from the statement period; Dec/Jan crossing handled | statements print 09/14, not 2026-09-14 |
| Balances, totals, summaries, ads ignored | only transaction lines |
| Busy (429) or 5xx: wait and retry, 4 tries per file | a year of PDFs in one go |
| PDF is never stored or logged; 4 MB per file (Vercel body cap) | privacy |

Money coming in is only guessed into an income category (kind `income`); otherwise it stays uncategorized rather than landing in Fees or Shopping. Applies to CSV too.

Verified Oct 23 2026: generated checking (30 lines, transfer + card payment) and card statement (12 lines, Dec/Jan): 30/30 and 12/12, transfers flagged right, 39 imported through the web UI in 15 s.

| Piece | File |
|---|---|
| Prompt, schema, validation (tests) | `packages/ai/src/statement.ts` |
| Endpoint | `apps/web/src/app/api/ai/parse-statement/route.ts` (60 files/hour) |
| Web flow | `apps/web/src/app/dashboard/import/page.tsx` |

Desktop has it from 1.0.3 (Oct 23 2026). Phone import stays CSV-only until a native release.
