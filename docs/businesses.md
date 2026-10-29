# Businesses (Oct 2026)

Keep side businesses (a farm, an antique booth, a book line) apart from personal
spending, and hand the CPA one file per business. Built for the side-business
segment (first customer: Machelle, Oct 23 2026 call). Ships with iPhone 1.0.2 and
the website on Oct 29 2026.

## The model

| Piece | What it is |
| --- | --- |
| `businesses` | `id, user_id, name (1-60), created_at, updated_at`. Unique per person, case and spaces ignored. RLS: own rows only. |
| `transactions.business_id` | Nullable FK, `ON DELETE SET NULL`. **Null = Personal.** An id pointing at a business that no longer exists also reads as Personal everywhere. |
| `set_transactions_business(p_ids, p_business_id)` | Bulk move (max 5000 ids per call, the web chunks). Bumps `version` so phones pull the change. |
| `delete_business(p_business_id)` | Moves that business's transactions to Personal (with a version bump), then deletes it. Nothing is lost. |
| `sync_upsert_transaction` | Writes `business_id` only when the payload carries the key. Phones on 1.0.1 (no key) never wipe a tag set on the web. An unknown id becomes null instead of failing the write. |

Migration: `supabase/migrations/044_businesses.sql` (applied to prod Oct 29 2026).

## Where it shows

| Surface | Web | iPhone |
| --- | --- | --- |
| Manage (add, rename, delete) | Settings > Businesses | More > Settings > Businesses |
| Tag while logging by voice | "for the farm" tags it (AI picks only from the person's list) | same, plus a Business row in the voice sheet's edit view. Siri sentences too ("Hey Siri, log an expense in Murmur" then "40 at Walmart for the farm"): the capture drain sends the list, cold launches read it from the device |
| Tag when typing | Business field in the transaction form | Business chips in New and Edit |
| See it | Business column, filter select (`?business=`), heading counts follow the filter | Business name in the row meta line, filter pills on All transactions, a Business row on the detail screen |
| Move many | Checkboxes + "Move to..." bar | (web only for now) |
| Import | "These transactions belong to" on CSV and PDF imports | (import is web only) |
| Export | Business select: Everything / Personal / one business. CSV gains a Business column, file name carries the business slug, PDF subtitle starts with the business | (export is web only) |

People with no businesses see none of this: every picker, column and filter
renders only once a business exists.

## Voice

- The phone sends the business names with each utterance (`businesses` in the
  parse request). The prompt gets a `<user_businesses>` block and a rule: name a
  business only when the person says it, never from the merchant or category.
- The schema gains `business` only when names are sent; the route maps the
  answer case-insensitively back to a sent name or drops it.
- Eval (Oct 29 2026, gpt-4o-mini): 8/8 on
  `scratchpad` script `biz-parse.mjs` (farm, booth, books, plain Walmart,
  Hy-Vee, Starbucks, farm income from Airbnb). Without businesses the
  response carries no `business` key.

## Phone storage

- SQLite column `business_id` (manifest + migration step `addBusinessIdV4`).
- V4 deletes `cursor:transaction` once so the next sync re-pulls every row with
  its business. Test: `localDb.migration.test.ts`.
- The business list is cached in `sync_meta` (`businesses:<userId>`) so voice
  and pickers know the names offline and on a cold start.

## Verified Oct 29 2026

- Web end to end against prod DB, 23 checks: add, duplicate refused, rename,
  delete, create tagged, filter + URL, new-while-filtered default, bulk move
  (version bump), heading count, Export link keeps the business, edit, CSV +
  PDF per business, CSV import into a business, delete business returns rows
  to Personal.
- Old phones: a sync write without the `business_id` key keeps the tag; a new
  phone can set it, clear it; an unknown id lands as Personal (5 checks
  against prod).
- iPhone 1.0.2 (91), simulator with Maestro: Settings row, add, duplicate
  refused, rename, delete with confirm, typed entry tagged (synced with the
  right business), Today and list labels, detail Business row, edit to another
  business (synced, version 2), filter pills All / Personal / each business.
- Not run live: speaking into the mic or Siri (the simulator has neither).
  Both go through the same parser and the 8/8 eval above.
