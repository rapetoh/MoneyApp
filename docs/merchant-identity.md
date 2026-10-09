# Merchant identity

Any card descriptor becomes the real business name and logo, on every capture path.

`711594-Mcgrath Volkswa` -> **McGrath Volkswagen** + VW logo

## Score (scripts/evals/merchant-identity.eval.mts, 32 real descriptors)

| | Before (Oct 5 2026) | Now |
|---|---|---|
| Real name | 18/32 | **32/32** |
| Logo loads | 8/32 | **32/32** |

Run before any change to the merchant prompt rules:

```
OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' apps/web/.env.local | cut -d= -f2- | tr -d '"') \
  npx --yes tsx scripts/evals/merchant-identity.eval.mts
```

## How it works

```
capture ──► instant: cleanMerchantDescriptor  ("711594-Mcgrath Volkswa" -> "Mcgrath Volkswa")
   │
   ├──► parser answers in 4 s ──► real name + domain saved  ("McGrath Volkswagen", vw.com)
   │
   └──► too slow / offline ──► MerchantEnrichment on next launch or foreground fixes the row
```

| Piece | File |
|---|---|
| Name + domain rules (voice, Apple Pay, Siri, notifications) | `packages/ai/src/prompt.ts` `getPrompt` |
| Receipt scan rules | `packages/ai/src/prompt.ts` `getScanPrompt` |
| Instant cleaner, domain normalizer, logo URL | `packages/shared/src/domain/merchantBrand.ts` |
| Apple Pay save | `apps/mobile/src/components/WalletCaptureDrain.tsx` |
| Android bank notifications | `apps/mobile/src/hooks/useNotificationListener.ts` |
| Repair of saved rows | `apps/mobile/src/services/merchantEnrichment.ts` |

## Rules

- Parent brand domain when the local site is unknown (dealer -> vw.com). Never invent.
- Delivery / processor paid a business -> the business is the merchant (`DD *DOORDASH CHIPOTLE` -> Chipotle).
- Logo URL always uses the `www.` host (bare `chick-fil-a.com` 404s on the favicon service).
- Enrichment touches only `shortcut` and `notification_listener` rows, 5 per run, each row once. A name the person typed is never replaced; only a missing logo domain is filled.
- Updates go through SQLite + the sync outbox, so web and other devices get the fix.

## Oct 9 2026 additions

- **Captures saved before the AI answered** are queued with the bank's original text (`queueForNaming`, `merchantEnrichment.ts`); the repair re-asks with it and replaces the fallback name unless the person renamed it. Runs 8 s after the save and on every launch/foreground. Repairs now push to the server immediately (`syncManager.drainQueue()`); before, they waited for the next unrelated write.
- **Logos are checked before they are kept** (import endpoint): any domain the logo service has nothing for gets one more AI pass with that feedback ("albertheijn.com has no site" gives ah.nl); still failing means no domain, so the letter tile shows instead of a broken image.
