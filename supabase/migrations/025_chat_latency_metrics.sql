-- Chat performance metrics (admin-only via ai_usage_log)

ALTER TABLE public.ai_usage_log
  ADD COLUMN IF NOT EXISTS ttft_ms INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_ai_usage_chat_latency
  ON public.ai_usage_log(feature, created_at DESC)
  WHERE feature = 'chat';
