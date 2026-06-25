-- MenAI V2: Unify initiatives into goals table
-- Idempotent — safe for DBs where goals was created by 005 (no description column)
-- Preserves initiative UUIDs as goal IDs for zero-downtime FK migration

-- ================================================================
-- 1. Bootstrap goals table — all columns app + migration need
-- ================================================================
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'onboarding',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS life_area TEXT DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS goal_kind TEXT DEFAULT 'direction',
  ADD COLUMN IF NOT EXISTS parent_goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_review JSONB,
  ADD COLUMN IF NOT EXISTS success_criteria TEXT,
  ADD COLUMN IF NOT EXISTS goal_stage TEXT;

-- Backfill defaults for existing rows
UPDATE public.goals SET goal_kind = 'direction' WHERE goal_kind IS NULL;
UPDATE public.goals SET priority = 'medium' WHERE priority IS NULL;
UPDATE public.goals SET category = COALESCE(category, life_area, 'personal') WHERE category IS NULL;

-- Add constraints only if not present (ignore if already exists)
DO $$
BEGIN
  ALTER TABLE public.goals ALTER COLUMN goal_kind SET DEFAULT 'direction';
  ALTER TABLE public.goals ALTER COLUMN goal_kind SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_life_area_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_life_area_check
  CHECK (life_area IS NULL OR life_area IN (
    'career', 'business', 'finance', 'health', 'learning', 'relationships', 'personal'
  ));

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_goal_kind_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_goal_kind_check
  CHECK (goal_kind IN ('direction', 'execution'));

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_goal_stage_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_goal_stage_check
  CHECK (goal_stage IS NULL OR goal_stage IN (
    'exploring', 'first_client', 'has_clients', 'scaling'
  ));

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN ('active', 'completed', 'paused', 'abandoned', 'archived'));

-- ================================================================
-- 2. Migrate initiatives → goals (preserve UUIDs) — only if table exists
-- ================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'initiatives'
  ) THEN
    INSERT INTO public.goals (
      id, user_id, title, description, target_date, status, progress,
      life_area, last_action_at, goal_kind, parent_goal_id,
      completed_at, completion_review, success_criteria, goal_stage,
      category, priority, created_at, updated_at
    )
    SELECT
      i.id,
      i.user_id,
      i.title,
      i.description,
      i.target_date,
      i.status,
      COALESCE(i.progress, 0),
      COALESCE(i.life_area, 'personal'),
      i.last_action_at,
      'execution',
      i.goal_id,
      i.completed_at,
      i.completion_review,
      i.success_criteria,
      i.initiative_stage,
      COALESCE(g.category, i.life_area, 'personal'),
      COALESCE(g.priority, 'medium'),
      i.created_at,
      i.updated_at
    FROM public.initiatives i
    LEFT JOIN public.goals g ON g.id = i.goal_id
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      target_date = EXCLUDED.target_date,
      status = EXCLUDED.status,
      progress = EXCLUDED.progress,
      life_area = EXCLUDED.life_area,
      last_action_at = EXCLUDED.last_action_at,
      goal_kind = 'execution',
      parent_goal_id = EXCLUDED.parent_goal_id,
      completed_at = EXCLUDED.completed_at,
      completion_review = EXCLUDED.completion_review,
      success_criteria = EXCLUDED.success_criteria,
      goal_stage = EXCLUDED.goal_stage,
      category = COALESCE(EXCLUDED.category, goals.category, 'personal'),
      updated_at = NOW();

    -- Mark direction-only goals (not migrated from initiatives)
    UPDATE public.goals SET goal_kind = 'direction'
    WHERE goal_kind IS DISTINCT FROM 'execution'
      AND id NOT IN (SELECT id FROM public.initiatives);
  END IF;
END $$;

-- ================================================================
-- 3. Rename initiative_milestones → goal_milestones (idempotent)
-- ================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'initiative_milestones'
  ) THEN
    ALTER TABLE public.initiative_milestones RENAME TO goal_milestones;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'goal_milestones' AND column_name = 'initiative_id'
  ) THEN
    ALTER TABLE public.goal_milestones RENAME COLUMN initiative_id TO goal_id;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_milestones_initiative;
CREATE INDEX IF NOT EXISTS idx_milestones_goal ON public.goal_milestones(goal_id, sort_order);

-- ================================================================
-- 4. Tasks: merge initiative_id into goal_id (do NOT rename — goal_id may exist)
-- ================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'initiative_id'
  ) THEN
    UPDATE public.tasks
    SET goal_id = COALESCE(goal_id, initiative_id)
    WHERE initiative_id IS NOT NULL;

    ALTER TABLE public.tasks DROP COLUMN initiative_id;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_tasks_initiative;
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON public.tasks(goal_id) WHERE goal_id IS NOT NULL;

-- Update trigger for goal last_action_at
DROP TRIGGER IF EXISTS trg_touch_initiative_last_action ON public.tasks;
DROP TRIGGER IF EXISTS trg_touch_goal_last_action ON public.tasks;
DROP FUNCTION IF EXISTS public.touch_initiative_last_action();

CREATE OR REPLACE FUNCTION public.touch_goal_last_action()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.goal_id IS NOT NULL THEN
    UPDATE public.goals
    SET last_action_at = COALESCE(NEW.completed_at, NOW())
    WHERE id = NEW.goal_id AND user_id = NEW.user_id AND goal_kind = 'execution';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_touch_goal_last_action
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.touch_goal_last_action();

-- ================================================================
-- 5. Profiles: current_focus_initiative_id → current_focus_goal_id
-- ================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'current_focus_initiative_id'
  ) THEN
    ALTER TABLE public.profiles
      RENAME COLUMN current_focus_initiative_id TO current_focus_goal_id;
  END IF;
END $$;

-- ================================================================
-- 6. Drop initiatives table (data already in goals)
-- ================================================================
DROP TABLE IF EXISTS public.initiatives CASCADE;

-- ================================================================
-- 7. Drop unused legacy tables
-- ================================================================
DROP TABLE IF EXISTS public.user_reports CASCADE;

-- ================================================================
-- 8. Drop coaching_style and founder_mode (single mentor persona)
-- ================================================================
DROP INDEX IF EXISTS idx_profiles_coaching_style;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS coaching_style;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS founder_mode;

-- ================================================================
-- 9. Indexes for execution goals
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_goals_user_execution
  ON public.goals(user_id, status, target_date)
  WHERE goal_kind = 'execution';

CREATE INDEX IF NOT EXISTS idx_goals_user_direction
  ON public.goals(user_id, status)
  WHERE goal_kind = 'direction';

COMMENT ON COLUMN public.goals.goal_kind IS
  'direction = long-term context; execution = active goal with deadline (max 3 active)';
