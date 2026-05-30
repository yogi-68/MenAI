-- AI usage tracking + query performance indexes

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_estimate NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_feature_date
  ON public.ai_usage_log(user_id, feature, created_at DESC);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages ai usage" ON public.ai_usage_log;
CREATE POLICY "Service role manages ai usage"
  ON public.ai_usage_log FOR ALL
  USING (auth.role() = 'service_role');

-- Conversation/message hot paths
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON public.conversations(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at ASC);

-- Require initiative deadlines going forward (soft: allow null for legacy rows)
COMMENT ON COLUMN public.initiatives.target_date IS
  'Required for new initiatives — drives daily plan quality';
