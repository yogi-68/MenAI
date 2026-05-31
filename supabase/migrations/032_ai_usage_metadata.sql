-- Claim quality and other admin metrics on AI usage rows

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_usage_metadata_claim_quality
  ON public.ai_usage_log(feature, created_at DESC)
  WHERE metadata ? 'claimQuality';
