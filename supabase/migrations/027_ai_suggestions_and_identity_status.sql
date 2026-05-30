-- AI suggestions (user confirms before initiatives/opportunities are created)
-- Identity signal lifecycle (active vs archived)

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('initiative', 'opportunity', 'direction')),
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  source_conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user_pending
  ON public.ai_suggestions(user_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own suggestions" ON public.ai_suggestions;
CREATE POLICY "Users manage own suggestions"
  ON public.ai_suggestions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages suggestions" ON public.ai_suggestions;
CREATE POLICY "Service role manages suggestions"
  ON public.ai_suggestions FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE public.identity_signals
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'archived'));

COMMENT ON TABLE public.ai_suggestions IS
  'AI-detected initiatives/opportunities awaiting user confirmation — never auto-activate initiatives.';
