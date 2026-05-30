-- Execution OS upgrade: life areas, initiative health signals, time tracking, opportunities

-- ================================================================
-- INITIATIVES: life area + last action tracking
-- ================================================================
ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS life_area TEXT NOT NULL DEFAULT 'personal'
    CHECK (life_area IN ('career', 'business', 'finance', 'health', 'learning', 'relationships', 'personal')),
  ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_initiatives_life_area
  ON public.initiatives(user_id, life_area)
  WHERE status = 'active';

-- ================================================================
-- TASKS: link to initiatives, actual time, skip count
-- ================================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS initiative_id UUID REFERENCES public.initiatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes > 0),
  ADD COLUMN IF NOT EXISTS skip_count INTEGER DEFAULT 0 CHECK (skip_count >= 0);

CREATE INDEX IF NOT EXISTS idx_tasks_initiative
  ON public.tasks(initiative_id)
  WHERE initiative_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_auto_generated
  ON public.tasks(user_id, due_date, status)
  WHERE auto_generated = true;

-- Touch initiative last_action_at when a linked task completes
CREATE OR REPLACE FUNCTION public.touch_initiative_last_action()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.initiative_id IS NOT NULL THEN
    UPDATE public.initiatives
    SET last_action_at = COALESCE(NEW.completed_at, NOW())
    WHERE id = NEW.initiative_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_touch_initiative_last_action ON public.tasks;
CREATE TRIGGER trg_touch_initiative_last_action
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.touch_initiative_last_action();

-- ================================================================
-- OPPORTUNITIES: time-sensitive upside (not just obligations)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  life_area TEXT DEFAULT 'personal'
    CHECK (life_area IN ('career', 'business', 'finance', 'health', 'learning', 'relationships', 'personal')),
  urgency TEXT NOT NULL DEFAULT 'medium'
    CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acted_on', 'expired', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_user_active
  ON public.opportunities(user_id, status, due_date)
  WHERE status = 'active';

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own opportunities" ON public.opportunities;
CREATE POLICY "Users manage own opportunities"
  ON public.opportunities FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages opportunities" ON public.opportunities;
CREATE POLICY "Service role manages opportunities"
  ON public.opportunities FOR ALL
  USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_opportunities_updated_at ON public.opportunities;
CREATE TRIGGER update_opportunities_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- GOALS: align category constraint with life-area vocabulary
-- ================================================================
UPDATE public.goals SET category = 'business' WHERE category IN ('startup');
UPDATE public.goals SET category = 'health' WHERE category IN ('fitness', 'health_fitness');
UPDATE public.goals SET category = 'finance' WHERE category IN ('financial', 'finances');
UPDATE public.goals SET category = 'relationships' WHERE category = 'relationship';
UPDATE public.goals SET category = 'personal' WHERE category IN ('identity', 'personal_growth', 'creativity');
UPDATE public.goals SET category = 'career' WHERE category IN ('career_work');
UPDATE public.goals SET category = 'other' WHERE category IS NULL OR category NOT IN (
  'career', 'business', 'finance', 'health', 'learning', 'relationships', 'personal', 'other',
  'personal_growth', 'health_fitness', 'career_work', 'creativity', 'finances'
);

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_category_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_category_check
  CHECK (category IN (
    'career', 'business', 'finance', 'health', 'learning', 'relationships', 'personal', 'other',
    'personal_growth', 'health_fitness', 'career_work', 'creativity', 'finances'
  ));

-- ================================================================
-- CLEANUP: drop unused legacy tables (mental-health prototype)
-- ================================================================
DROP TABLE IF EXISTS public.habit_logs CASCADE;
DROP TABLE IF EXISTS public.habits CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.task_generation_log CASCADE;

COMMENT ON TABLE public.opportunities IS
  'Time-sensitive opportunities that may outweigh routine planned tasks';
COMMENT ON COLUMN public.initiatives.life_area IS
  'Life area this initiative belongs to — used for balance and execution metrics';
COMMENT ON COLUMN public.tasks.actual_minutes IS
  'Actual time spent — compared to estimated_minutes for personalized planning';
