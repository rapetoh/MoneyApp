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
| `businesses.logo` (045) | Nullable. `data:image/(png\|jpeg\|webp);base64,...`, max 200,000 chars (CHECK). The apps write a 256 px square JPEG at 0.85, about 20 to 40 KB. |
| `businesses.icon` (045) | Nullable. One of 12 keys (CHECK): `storefront leaf book camera briefcase car restaurant color-palette construct paw cart cut`. Null = the icon the name suggests. |

Migrations: `supabase/migrations/044_businesses.sql` (applied to prod Oct 29 2026),
`supabase/migrations/045_business_identity.sql` (applied to prod Nov 15 2026;
columns and both CHECK constraints verified).

The web and iPhone 1.0.2 write `icon` when a business is created, so 045 had
to land before either shipped. Reads use `select('*')`.

Older builds stay safe after 045: they insert `(user_id, name)` and update
`name` only, and PostgREST writes only the columns a request names, so they
never touch `logo` or `icon`. RLS is unchanged (044's own-rows policy).

## Every business has a face (Nov 2026)

A business is drawn as a **tile**, never a letter:

- uploaded logo, if set
- else its icon (stored `icon`, else `defaultBusinessIcon(name)`), sage glyph on sage-soft
- rounded square, corner radius 28% of the size

| Piece | Where |
| --- | --- |
| `BUSINESS_ICONS`, `defaultBusinessIcon`, `businessIcon`, `isBusinessLogo` | `packages/shared/src/domain/businessIcon.ts` (tests next to it) |
| Phone tile | `apps/mobile/src/components/BusinessMark.tsx` (Ionicons `<key>-outline`) |
| Web tile | `apps/web/src/components/BusinessMark.tsx` (the same Ionicons outlines as inline SVG) |

Name to icon: whole words, any case, accents folded, first matching word wins.

| Words | Icon |
| --- | --- |
| farm garden ranch orchard plant flower | leaf |
| booth shop store antique(s) market boutique vintage | storefront |
| book(s) author writing press | book |
| photo photography studio | camera |
| uber lyft ride rideshare driving delivery courier | car |
| bake bakery food catering cafe kitchen chef | restaurant |
| design art paint craft(s) | color-palette |
| repair construction handyman contractor build | construct |
| pet dog(s) groom grooming | paw |
| salon barber hair nails | cut |
| etsy ebay resale online reseller | cart |
| anything else | briefcase |

"Art studio" = palette, "Etsy shop" = cart, "Book store" = book. A new business
stores its icon at creation, so a rename keeps the face. Choosing an icon also
clears the logo (the logo always wins the tile).

## Where it shows

| Surface | Web | iPhone |
| --- | --- | --- |
| Manage (add, rename, delete) | Settings > Businesses | More > Settings > Businesses |
| Logo or icon | Settings > Businesses: click the tile. Upload logo (PNG, JPEG, WebP, max 10 MB; center-cropped, 256 px, JPEG 0.85), Choose icon (grid of 12), Remove logo | More > Settings > Businesses: tap the tile. Choose a photo (system picker, square crop, then 256 px JPEG 0.85 via expo-image-manipulator), Choose an icon (sheet of 12), Remove logo |
| The tile | Business column, the "Move to..." menu, the Settings list. The filter stays a plain select | Settings list, chips in New / Edit / voice sheet, the voice summary tag, filter pills, row meta line (14 pt), detail Business row |
| One business's month | (not yet) | Filter pills on All transactions: picking a business shows a header card (44 pt tile, name, spent this calendar month, count) above the list |
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
  and pickers know the names offline and on a cold start. `logo` and `icon`
  ride along; a list cached by an older build has neither and draws the
  name's icon.
- `expo-image-manipulator` (logo resize) is a new native module: the logo
  upload needs a new EAS build. The photo-library usage string (app.config.js,
  expo-image-picker plugin) now names business logos too.

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

## Business faces: checked Nov 12 2026 (code only)

- Typecheck web, iPhone, shared; lint web, iPhone, shared; vitest shared
  (incl. `businessIcon.test.ts`, 73 cases), iPhone, web; shared Deno bundle
  up to date.
- (Nov 12) Not run yet: 045, the web in a browser, the phone in the simulator.

## Business faces: checked end to end Nov 15 2026

| Where | Result |
|---|---|
| Prod DB | 045 applied; `logo`, `icon` columns and both CHECKs present |
| Web (localhost against prod, Chrome) | 17/17: new businesses get leaf / storefront / book; upload saves a 256x256 JPEG data URL; tile shows it; icon pick saves and clears the logo; a name-only update keeps the logo; Transactions rows show the logo and the icon; Move to menu lists tiles and the move saves; Remove logo returns to the icon |
| iPhone (simulator, Release build) | photo picker, square crop, logo saved (13 KB JPEG) and shown; icon sheet pick saved (`cart`); Remove logo back to the icon; new "Dog walking" saved with `paw` |
| Found and fixed | every BottomSheet read as one VoiceOver element (see below) |

**VoiceOver fix (Nov 15 2026).** `BottomSheet` wrapped the sheet in two
Pressables (the backdrop and a stopPropagation body). A Pressable is one
accessibility element, so VoiceOver read the whole sheet as one item and no
icon, row or button inside could be picked. This hit every sheet: business icon
picker, Insights month, Transactions month, Ask history, new transaction
More options, onboarding language and currency. The backdrop is now a layer behind the sheet, hidden from
screen readers, the sheet is `accessibilityViewIsModal`, the escape gesture
closes it, and Cancel is a button. Same structure as `CenterModal`. Tests in
`BottomSheet.test.ts` fail on the old structure.
