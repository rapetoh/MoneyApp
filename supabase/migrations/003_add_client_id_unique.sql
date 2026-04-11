-- Add unique constraint on client_id so ON CONFLICT (client_id) works correctly
-- in the sync upsert. client_id is the client-generated UUID used for deduplication.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_client_id_unique UNIQUE (client_id);
