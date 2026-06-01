-- evidence_count: distinct corroborations (chat mentions + reflections) — drives influence
ALTER TABLE public.mentor_memories
  ADD COLUMN IF NOT EXISTS evidence_count INTEGER NOT NULL DEFAULT 1;

-- Backfill from mention_count where present
UPDATE public.mentor_memories
SET evidence_count = COALESCE(mention_count, 1)
WHERE evidence_count = 1 AND mention_count > 1;

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS evidence_count INTEGER;

UPDATE public.execution_patterns
SET evidence_count = COALESCE(occurrences, 1)
WHERE evidence_count IS NULL;

COMMENT ON COLUMN public.mentor_memories.evidence_count IS
  'Corroborated evidence count — chat mentions + reflections; one mention ≠ core belief';

COMMENT ON COLUMN public.execution_patterns.evidence_count IS
  'Same as occurrences but explicit for retrieval prompts';
