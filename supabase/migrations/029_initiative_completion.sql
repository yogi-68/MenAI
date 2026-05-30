-- Initiative completion review storage

ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_review JSONB;

COMMENT ON COLUMN public.initiatives.completion_review IS
  'AI-generated completion narrative + learnings when initiative is marked complete.';
