-- Migration 016 — Close the open sync_operations INSERT policy; RLS and
-- function hardening (audit 06-F4, 06-F23, 06-F35).
--
-- 001's "Service role can insert sync operations" policy was
-- `FOR INSERT WITH CHECK (true)` with no TO clause, which defaults to
-- PUBLIC — and `anon` held the table's INSERT grant, so anyone with the
-- publishable key (shipped in every client bundle by design) could write
-- unbounded rows with no session. Service-role clients bypass RLS and never
-- needed a policy; the replacement scopes client inserts to the caller's own
-- rows.
--
-- Also here, per the same audit pass:
--   * `handle_new_user` / `set_updated_at` get a pinned search_path
--     (SECURITY DEFINER with a mutable search_path is a hijack surface;
--     007/013 already pin theirs — this is drift, not a new pattern).
--   * Trigger functions lose the default PUBLIC EXECUTE grant — they are
--     only ever invoked by their triggers, never over /rest/v1/rpc.
--   * `profiles` gains the missing DELETE policy so every user table covers
--     all four commands.

BEGIN;

-- ============================================================
-- 1. sync_operations: scope INSERT to the row owner
-- ============================================================
DROP POLICY "Service role can insert sync operations" ON public.sync_operations;

CREATE POLICY "Users can insert own sync operations"
  ON public.sync_operations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sync_operations FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.sync_operations FROM authenticated;

-- ai_usage_log is service-role-only; its `USING (false)` policy already
-- denies client writes, but the grants should match the intent instead of
-- being one policy line away from an open table.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_usage_log FROM anon, authenticated;

-- ============================================================
-- 2. Function hardening
-- ============================================================
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION
  public.handle_new_user(),
  public.set_updated_at(),
  public.bump_ask_conversation_last_message(),
  public.link_or_create_recurring_rule(),
  public.deactivate_recurring_rule_on_unflag()
FROM anon, authenticated, public;

-- ============================================================
-- 3. profiles: complete the per-command policy set
-- ============================================================
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);

COMMIT;
