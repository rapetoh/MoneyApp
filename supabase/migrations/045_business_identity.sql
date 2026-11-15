-- 045: Business identity (Nov 2026).
--
-- Every business gets a face: an uploaded logo, or one of twelve icons.
-- A business is never drawn as a plain letter tile (docs/businesses.md).
--
--   logo  A small square image the app made on the device (256x256 JPEG,
--         about 20 to 40 KB as base64), stored inline as a data URL so the
--         phone's offline business cache carries it with no extra fetch.
--         Capped at 200,000 characters.
--   icon  One of the twelve keys in BUSINESS_ICONS (packages/shared,
--         domain/businessIcon.ts). Null means "pick from the name"
--         (defaultBusinessIcon), which is also what businesses created
--         before this migration, or by older app builds, render.
--
-- Older app builds never send either column. They write businesses with a
-- plain insert of (user_id, name) and an update of (name) only, and
-- PostgREST updates only the columns a request names, so a rename on a
-- phone running 1.0.2 leaves logo and icon exactly as they are. The
-- delete_business() and set_transactions_business() functions from 044 do
-- not touch these columns. RLS is unchanged: businesses_own (044) already
-- limits every read and write to the person's own rows.

BEGIN;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS logo text NULL
    CONSTRAINT businesses_logo_check CHECK (
      logo IS NULL
      OR (logo ~ '^data:image/(png|jpeg|webp);base64,' AND length(logo) <= 200000)
    );

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS icon text NULL
    CONSTRAINT businesses_icon_check CHECK (
      icon IS NULL
      OR icon IN (
        'storefront', 'leaf', 'book', 'camera', 'briefcase', 'car',
        'restaurant', 'color-palette', 'construct', 'paw', 'cart', 'cut'
      )
    );

COMMIT;
