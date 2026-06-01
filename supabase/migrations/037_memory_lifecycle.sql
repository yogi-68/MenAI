-- Living memory lifecycle: influence scoring, tiers, expiration, merge support

-- Expand mentor memory types and statuses
ALTER TABLE public.mentor_memories
  DROP CONSTRAINT IF EXISTS mentor_memories_memory_type_check;

ALTER TABLE public.mentor_memories
  ADD CONSTRAINT mentor_memories_memory_type_check CHECK (
    memory_type IN (
      'belief', 'thought', 'relationship_note', 'self_talk', 'pattern_mention',
      'core_value', 'direction', 'opportunity'
    )
  );

ALTER TABLE public.mentor_memories
  DROP CONSTRAINT IF EXISTS mentor_memories_status_check;

ALTER TABLE public.mentor_memories
  ADD CONSTRAINT mentor_memories_status_check CHECK (
    status IN ('active', 'supporting', 'archived', 'expired', 'superseded', 'deleted')
  );

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS influence_score REAL DEFAULT 0.8
  CHECK (influence_score >= 0 AND influence_score <= 1);

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES public.mentor_memories(id) ON DELETE SET NULL;

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS life_area TEXT;

CREATE INDEX IF NOT EXISTS idx_mentor_memories_influence
  ON public.mentor_memories(user_id, influence_score DESC)
  WHERE status IN ('active', 'supporting');

-- Expand execution pattern statuses
ALTER TABLE public.execution_patterns
  DROP CONSTRAINT IF EXISTS execution_patterns_status_check;

ALTER TABLE public.execution_patterns
  ADD CONSTRAINT execution_patterns_status_check CHECK (
    status IN ('active', 'supporting', 'archived', 'expired', 'superseded', 'deleted')
  );

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS influence_score REAL DEFAULT 0.7
  CHECK (influence_score IS NULL OR (influence_score >= 0 AND influence_score <= 1));

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS last_mentioned_at TIMESTAMPTZ DEFAULT NOW();

-- Track when each life area was last reinforced (for weight decay)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS life_area_last_mentioned JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.mentor_memories.influence_score IS
  'Computed: confidence × recency × mentions — used for retrieval ranking';

COMMENT ON COLUMN public.mentor_memories.expires_at IS
  'Temporary context (interviews, deadlines) — auto-expires after this time';

COMMENT ON COLUMN public.profiles.life_area_last_mentioned IS
  'ISO timestamps per life area — weights decay when area not mentioned';
