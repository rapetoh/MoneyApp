-- Migration 024 — server-side default for client_id on the three tables
-- migration 018 extended the sync contract to.
--
-- 018 made client_id NOT NULL with no default; deployed clients (the
-- current TestFlight build and the live web app) do not send client_id on
-- categories/budgets/recurring_rules inserts yet, so new-user category
-- seeding and budget creation would fail at runtime the moment 018 was
-- applied, until the typed-client adoption ships. A server-minted UUID is
-- a safe fallback: the row remains uniquely addressable per
-- (user_id, client_id), and clients that DO send their own client-minted
-- id simply override the default. Discovered by the regenerated typed
-- Database client (fix-plan 1.2) refusing exactly these insert payloads.

ALTER TABLE public.categories      ALTER COLUMN client_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.budgets         ALTER COLUMN client_id SET DEFAULT gen_random_uuid();
ALTER TABLE public.recurring_rules ALTER COLUMN client_id SET DEFAULT gen_random_uuid();
