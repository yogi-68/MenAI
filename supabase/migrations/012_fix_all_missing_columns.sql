-- ================================================================
-- COMPREHENSIVE FIX: Add all potentially missing columns
-- This migration ensures all tables have all required columns
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ================================================================

-- ================================================================
-- FIX PROFILES TABLE
-- ================================================================
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS vision TEXT,
  ADD COLUMN IF NOT EXISTS founder_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS coaching_style TEXT DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS lifestyle_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stress_response JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_style TEXT,
  ADD COLUMN IF NOT EXISTS daily_priorities JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS support_style TEXT DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS reflection_frequency TEXT DEFAULT 'weekly';

-- Update profiles constraint for coaching_style if it exists with wrong values
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'profiles' AND column_name = 'coaching_style'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_coaching_style_check;
  END IF;
END $$;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_coaching_style_check 
  CHECK (coaching_style IN ('balanced', 'gentle', 'direct', 'strategic'));

-- ================================================================
-- FIX TASKS TABLE
-- ================================================================
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS goal_id UUID,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add foreign key constraint for goal_id if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tasks_goal_id_fkey' AND table_name = 'tasks'
  ) THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT tasks_goal_id_fkey 
      FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add priority check constraint if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'tasks' AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT tasks_priority_check 
      CHECK (priority IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- ================================================================
-- FIX COMMITMENTS TABLE
-- ================================================================
ALTER TABLE public.commitments 
  ADD COLUMN IF NOT EXISTS timeframe TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'onboarding',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update default consistency_score if needed
DO $$ 
BEGIN
  ALTER TABLE public.commitments ALTER COLUMN consistency_score SET DEFAULT 100.0;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- ================================================================
-- FIX GOALS TABLE
-- ================================================================
ALTER TABLE public.goals 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'onboarding',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ================================================================
-- CREATE MISSING INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON public.tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_gen ON public.tasks(user_id, auto_generated, due_date) WHERE auto_generated = true;
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_date ON public.tasks(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_profiles_coaching_style ON public.profiles(coaching_style);
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON public.goals(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commitments_user_status ON public.commitments(user_id, status);

-- ================================================================
-- CREATE MISSING TRIGGERS
-- ================================================================
-- Ensure update_updated_at function exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at 
  BEFORE UPDATE ON public.tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_commitments_updated_at ON public.commitments;
CREATE TRIGGER update_commitments_updated_at 
  BEFORE UPDATE ON public.commitments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_goals_updated_at ON public.goals;
CREATE TRIGGER update_goals_updated_at 
  BEFORE UPDATE ON public.goals 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- ADD COMMENTS
-- ================================================================
COMMENT ON COLUMN public.tasks.goal_id IS 'Optional reference to a goal this task contributes to';
COMMENT ON COLUMN public.tasks.priority IS 'Task priority level';
COMMENT ON COLUMN public.tasks.auto_generated IS 'Whether this task was auto-generated by the system';
COMMENT ON COLUMN public.tasks.generation_reason IS 'Reason for auto-generation (e.g., daily_auto_generation)';

COMMENT ON COLUMN public.profiles.vision IS 'User long-term vision or life direction';
COMMENT ON COLUMN public.profiles.founder_mode IS 'Whether user operates in founder/builder mode';
COMMENT ON COLUMN public.profiles.coaching_style IS 'AI interaction style preference';
COMMENT ON COLUMN public.profiles.daily_priorities IS 'Areas of daily focus from onboarding';
COMMENT ON COLUMN public.profiles.support_style IS 'How user prefers guidance';
COMMENT ON COLUMN public.profiles.reflection_frequency IS 'How often user wants to reflect';

COMMENT ON COLUMN public.commitments.source IS 'Where this commitment came from (onboarding, conversation, etc)';
COMMENT ON COLUMN public.commitments.timeframe IS 'When user wants to achieve this commitment';

COMMENT ON COLUMN public.goals.source IS 'Where this goal came from (onboarding, conversation, etc)';
