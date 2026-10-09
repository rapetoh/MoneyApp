-- 043: Transactions imported from a file (Oct 2026).
--
-- CSV import (docs/csv-import.md) marks its rows `source = 'import'`, so
-- they can be told apart from what was spoken, typed or captured, and an
-- import can be found again. App versions that predate this read an
-- unknown source as typed (packages/shared/src/domain/source.ts falls
-- through to 'typed'), so nothing older breaks on these rows.

BEGIN;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
  CHECK (source = ANY (ARRAY[
    'voice', 'manual', 'scan', 'shortcut',
    'notification_listener', 'recurring_generated', 'import'
  ]::text[]));

COMMIT;
