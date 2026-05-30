-- Unified user model — single source of truth for all AI features

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_model JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS user_model_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.user_model IS
  'Synthesized execution profile: identity, focus, outcomes, obstacles, narrative. Consumed by chat, plans, dashboard, reviews.';

COMMENT ON COLUMN public.profiles.user_model_updated_at IS
  'When user_model was last synthesized from database sources';
