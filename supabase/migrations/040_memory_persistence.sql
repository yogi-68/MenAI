-- MenAI V2: Permanent memory persistence for identity facts

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS memory_class TEXT DEFAULT 'general'
    CHECK (memory_class IS NULL OR memory_class IN (
      'identity', 'preference', 'event', 'goal', 'habit', 'relationship',
      'career', 'business', 'fitness', 'decision', 'general'
    ));

CREATE INDEX IF NOT EXISTS idx_mentor_memories_permanent
  ON public.mentor_memories(user_id, is_permanent)
  WHERE is_permanent = true AND status = 'active';

-- Backfill: high-confidence core values and direction memories are permanent
UPDATE public.mentor_memories
SET is_permanent = true,
    memory_class = CASE
      WHEN memory_type = 'core_value' THEN 'identity'
      WHEN memory_type = 'direction' THEN 'goal'
      WHEN memory_type = 'belief' AND confidence >= 0.8 THEN 'identity'
      ELSE memory_class
    END
WHERE (memory_type IN ('core_value', 'direction') OR (memory_type = 'belief' AND confidence >= 0.8))
  AND status = 'active';

COMMENT ON COLUMN public.mentor_memories.is_permanent IS
  'Permanent memories never decay or get archived — used for identity, vision, core facts';
