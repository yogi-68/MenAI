-- Memory aging: archive stale memories, reduce influence over time

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'archived', 'superseded'));

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_mentor_memories_active
  ON public.mentor_memories(user_id, last_mentioned_at DESC)
  WHERE status = 'active';

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'archived'));

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.mentor_memories.status IS
  'active = influences planning; archived/superseded = decayed or replaced by direction shift';
