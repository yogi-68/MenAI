-- Onboarding System Migration
-- Stores onboarding responses and extracts initial memory seeds

-- Onboarding Responses Table
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question_id text NOT NULL,
  response_text text,
  response_data jsonb, -- For multi-choice answers
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_onboarding_user ON public.onboarding_responses(user_id);
CREATE INDEX idx_onboarding_question ON public.onboarding_responses(user_id, question_id);
CREATE INDEX idx_onboarding_processed ON public.onboarding_responses(processed, created_at);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own onboarding responses" ON public.onboarding_responses;
CREATE POLICY "Users can manage own onboarding responses" 
  ON public.onboarding_responses FOR ALL 
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.onboarding_responses IS 'Stores user onboarding questionnaire responses';
COMMENT ON COLUMN public.onboarding_responses.response_data IS 'Structured data for multiple choice, sliders, etc.';

-- Onboarding Progress Table
CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_question_id text,
  completed_questions jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own onboarding progress" ON public.onboarding_progress;
CREATE POLICY "Users can manage own onboarding progress" 
  ON public.onboarding_progress FOR ALL 
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.onboarding_progress IS 'Tracks user progress through onboarding flow';

-- Add lifecycle_issues column to profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'lifestyle_issues'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN lifestyle_issues jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add stress_response column to profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'stress_response'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stress_response jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add work_style column to profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'work_style'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN work_style text;
  END IF;
END $$;

-- Grant privileges
GRANT ALL ON public.onboarding_responses TO authenticated;
GRANT ALL ON public.onboarding_progress TO authenticated;
