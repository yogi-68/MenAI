-- Structured plan-interview answers (dynamic context gathering)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_context JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.plan_context IS
  'User-provided planning context from dynamic interview (hours, obstacle, 90-day outcome, etc.)';
