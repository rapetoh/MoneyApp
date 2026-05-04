-- Ask Murmur conversation history.
--
-- Two tables: `ask_conversations` (one row per thread) and `ask_messages`
-- (one row per turn). RLS pinned to `auth.uid() = user_id` on both, same
-- pattern as transactions / categories / recurring_rules. A trigger bumps
-- the parent conversation's `last_message_at` whenever a message lands so
-- the history list can sort by recency without a join.

CREATE TABLE IF NOT EXISTS public.ask_conversations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Auto-derived from the first user question (truncated client-side). Null
  -- until the first message lands. Editable later if we add a rename UI.
  title           text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- Soft delete so history can be restored if the user changes their mind.
  is_deleted      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ask_conversations_user_recent_idx
  ON public.ask_conversations (user_id, last_message_at DESC)
  WHERE is_deleted = false;

ALTER TABLE public.ask_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their ask conversations"
  ON public.ask_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.ask_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.ask_conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
  -- Populated for role='user'. The user's raw question, trimmed.
  question        text,
  -- Populated for role='assistant'. Stores the full validated AskMurmurResponse
  -- as JSON so re-rendering is a one-pass deserialize. Verdict/breakdown/chart
  -- all live inside.
  response        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Sanity: a turn must carry the field appropriate to its role.
  CONSTRAINT ask_messages_role_payload_check CHECK (
    (role = 'user'      AND question  IS NOT NULL AND response IS NULL) OR
    (role = 'assistant' AND response  IS NOT NULL AND question IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS ask_messages_conv_chrono_idx
  ON public.ask_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS ask_messages_user_recent_idx
  ON public.ask_messages (user_id, created_at DESC);

ALTER TABLE public.ask_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their ask messages"
  ON public.ask_messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- Bump the parent conversation's `last_message_at` and `updated_at` whenever
-- a message is inserted. SECURITY DEFINER so the trigger can update the
-- parent regardless of who owns it (RLS still gates the underlying INSERT).
CREATE OR REPLACE FUNCTION public.bump_ask_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ask_conversations
     SET last_message_at = NEW.created_at,
         updated_at      = now()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ask_messages_bump_conversation ON public.ask_messages;

CREATE TRIGGER ask_messages_bump_conversation
  AFTER INSERT ON public.ask_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_ask_conversation_last_message();
