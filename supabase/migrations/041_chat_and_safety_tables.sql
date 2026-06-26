-- 041: Chat messages + crisis safety logging
-- These tables are referenced in app code but were never CREATE TABLE'd in prior migrations.

-- ================================================================
-- MESSAGES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  emotion_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_user_created
  ON public.messages(user_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own messages" ON public.messages;
CREATE POLICY "Users can manage own messages"
  ON public.messages FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages messages" ON public.messages;
CREATE POLICY "Service role manages messages"
  ON public.messages FOR ALL
  USING (auth.role() = 'service_role');

-- ================================================================
-- CRISIS EVENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.crisis_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  crisis_level TEXT NOT NULL,
  categories JSONB DEFAULT '[]'::jsonb,
  matched_patterns JSONB DEFAULT '[]'::jsonb,
  confidence NUMERIC(5, 4),
  escalated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crisis_events_user_created
  ON public.crisis_events(user_id, created_at DESC);

ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own crisis events" ON public.crisis_events;
CREATE POLICY "Users can read own crisis events"
  ON public.crisis_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages crisis events" ON public.crisis_events;
CREATE POLICY "Service role manages crisis events"
  ON public.crisis_events FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.messages IS 'Coach chat messages; cascade delete with conversations';
COMMENT ON TABLE public.crisis_events IS 'Safety pipeline escalations; service-role insert from orchestrator';
