-- Mentor memories: beliefs, thoughts, self-talk (not just goals/tasks)
CREATE TABLE IF NOT EXISTS public.mentor_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (
    memory_type IN ('belief', 'thought', 'relationship_note', 'self_talk', 'pattern_mention')
  ),
  text TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT DEFAULT 'chat',
  mention_count INTEGER NOT NULL DEFAULT 1,
  last_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mentor_memories_user
  ON public.mentor_memories(user_id, last_mentioned_at DESC);

ALTER TABLE public.mentor_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own mentor memories" ON public.mentor_memories;
CREATE POLICY "Users manage own mentor memories"
  ON public.mentor_memories FOR ALL
  USING (auth.uid() = user_id);

-- Life-area attention weights (business 0.45, fitness 0.25, etc.)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS life_area_weights JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.life_area_weights IS
  'Normalized life-area attention weights — updated from onboarding, chat, and initiatives';
