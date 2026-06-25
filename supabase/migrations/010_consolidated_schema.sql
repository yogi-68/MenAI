-- ================================================================
-- CONSOLIDATED SCHEMA - MenAI Life Companion
-- This migration consolidates all tables and fixes conflicts
-- Consolidated schema (run after 005–009 if upgrading an existing project)
-- ================================================================

-- ================================================================
-- CLEAN UP: Drop conflicting tables if they exist from old migrations
-- ================================================================
DROP TABLE IF EXISTS public.accountability_log CASCADE;
DROP TABLE IF EXISTS public.identity_signals CASCADE;
DROP TABLE IF EXISTS public.execution_patterns CASCADE;
DROP TABLE IF EXISTS public.behavioral_observations CASCADE;

-- ================================================================
-- PROFILES: Add missing columns
-- ================================================================
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS vision TEXT,
  ADD COLUMN IF NOT EXISTS founder_mode BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS coaching_style TEXT DEFAULT 'balanced' CHECK (coaching_style IN ('balanced', 'gentle', 'direct', 'strategic')),
  ADD COLUMN IF NOT EXISTS lifestyle_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stress_response JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_style TEXT,
  ADD COLUMN IF NOT EXISTS daily_priorities JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS support_style TEXT DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS reflection_frequency TEXT DEFAULT 'weekly';

COMMENT ON COLUMN public.profiles.vision IS 'User long-term vision or life direction';
COMMENT ON COLUMN public.profiles.founder_mode IS 'Whether user operates in founder/builder mode';
COMMENT ON COLUMN public.profiles.coaching_style IS 'AI interaction style preference';
COMMENT ON COLUMN public.profiles.daily_priorities IS 'Areas of daily focus from onboarding';
COMMENT ON COLUMN public.profiles.support_style IS 'How user prefers guidance';
COMMENT ON COLUMN public.profiles.reflection_frequency IS 'How often user wants to reflect';

-- ================================================================
-- MEMORIES: Update memory types
-- ================================================================
ALTER TABLE public.memories DROP CONSTRAINT IF EXISTS memories_memory_type_check;
ALTER TABLE public.memories ADD CONSTRAINT memories_memory_type_check 
  CHECK (memory_type IN ('conversation', 'insight', 'preference', 'mood', 'journal', 'goal', 'commitment', 'relationship', 'behavioral', 'identity'));

-- ================================================================
-- GOALS: Ensure proper structure
-- ================================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('personal_growth', 'health_fitness', 'career_work', 'relationships', 'creativity', 'learning', 'finances', 'other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'abandoned')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  target_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  source TEXT DEFAULT 'onboarding',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_status ON public.goals(user_id, status, created_at DESC);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own goals" ON public.goals;
CREATE POLICY "Users can manage own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages goals" ON public.goals;
CREATE POLICY "Service role manages goals" ON public.goals FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- TASKS: Enhanced structure with auto-generation support
-- ================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  scheduled_time TIME,
  recurrence TEXT CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'weekdays')),
  streak_count INTEGER DEFAULT 0,
  auto_generated BOOLEAN DEFAULT false,
  generation_reason TEXT,
  last_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure goal_id column exists even if tasks table was created by a prior migration
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS scheduled_time TIME;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence TEXT CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'weekdays'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS generation_reason TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS last_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_user_status_date ON public.tasks(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON public.tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_gen ON public.tasks(user_id, auto_generated, due_date) WHERE auto_generated = true;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own tasks" ON public.tasks;
CREATE POLICY "Users can manage own tasks" ON public.tasks FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages tasks" ON public.tasks;
CREATE POLICY "Service role manages tasks" ON public.tasks FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- COMMITMENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  category TEXT CHECK (category IN ('health', 'work', 'relationships', 'personal', 'other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  consistency_score NUMERIC(5,2) DEFAULT 100.0,
  times_followed_through INTEGER DEFAULT 0,
  times_broken INTEGER DEFAULT 0,
  timeframe TEXT,
  source TEXT DEFAULT 'onboarding',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitments_user_status ON public.commitments(user_id, status);

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own commitments" ON public.commitments;
CREATE POLICY "Users can manage own commitments" ON public.commitments FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages commitments" ON public.commitments;
CREATE POLICY "Service role manages commitments" ON public.commitments FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- IDENTITY SIGNALS: User's identity markers from onboarding
-- ================================================================
CREATE TABLE IF NOT EXISTS public.identity_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  signal_type TEXT NOT NULL,
  description TEXT NOT NULL,
  long_term_direction TEXT,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT DEFAULT 'onboarding',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identity_signals_user ON public.identity_signals(user_id);

ALTER TABLE public.identity_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own signals" ON public.identity_signals;
CREATE POLICY "Users can view own signals" ON public.identity_signals FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages signals" ON public.identity_signals;
CREATE POLICY "Service role manages signals" ON public.identity_signals FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- EXECUTION PATTERNS: Behavioral patterns from onboarding
-- ================================================================
CREATE TABLE IF NOT EXISTS public.execution_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pattern TEXT NOT NULL CHECK (pattern IN ('overthinking', 'procrastination', 'avoidance', 'perfectionism', 'scattered_focus', 'inconsistency', 'burnout')),
  trigger TEXT,
  frequency TEXT CHECK (frequency IN ('rare', 'occasional', 'frequent', 'constant')),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high')),
  behavioral_impact TEXT,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  occurrences INTEGER DEFAULT 1,
  last_detected TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_patterns_user ON public.execution_patterns(user_id, pattern);

ALTER TABLE public.execution_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own patterns" ON public.execution_patterns;
CREATE POLICY "Users can view own patterns" ON public.execution_patterns FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages patterns" ON public.execution_patterns;
CREATE POLICY "Service role manages patterns" ON public.execution_patterns FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- ONBOARDING RESPONSES & PROGRESS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  question_id TEXT NOT NULL,
  response_text TEXT,
  response_data JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_responses_user ON public.onboarding_responses(user_id, question_id);

ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own responses" ON public.onboarding_responses;
CREATE POLICY "Users can manage own responses" ON public.onboarding_responses FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  current_question_id TEXT,
  completed_questions TEXT[] DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_progress_user ON public.onboarding_progress(user_id);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own progress" ON public.onboarding_progress;
CREATE POLICY "Users can manage own progress" ON public.onboarding_progress FOR ALL USING (auth.uid() = user_id);

-- ================================================================
-- DAILY PLANS: AI-generated plans
-- ================================================================
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  plan_content JSONB NOT NULL,
  ai_notes TEXT,
  completion_score INTEGER CHECK (completion_score IS NULL OR (completion_score >= 0 AND completion_score <= 100)),
  energy_level INTEGER CHECK (energy_level IS NULL OR (energy_level >= 1 AND energy_level <= 10)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_user_date ON public.daily_plans(user_id, plan_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plans_unique ON public.daily_plans(user_id, plan_date);

ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own plans" ON public.daily_plans;
CREATE POLICY "Users can manage own plans" ON public.daily_plans FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages plans" ON public.daily_plans;
CREATE POLICY "Service role manages plans" ON public.daily_plans FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- TASK GENERATION LOG: Track auto-generated tasks
-- ================================================================
CREATE TABLE IF NOT EXISTS public.task_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  generation_date DATE DEFAULT CURRENT_DATE,
  tasks_generated INTEGER DEFAULT 0,
  generation_reason TEXT,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_gen_log_user ON public.task_generation_log(user_id, generation_date DESC);

ALTER TABLE public.task_generation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own task gen log" ON public.task_generation_log;
CREATE POLICY "Users can view own task gen log" ON public.task_generation_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages task gen log" ON public.task_generation_log;
CREATE POLICY "Service role manages task gen log" ON public.task_generation_log FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- TRIGGERS
-- ================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_goals_updated_at ON public.goals;
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_commitments_updated_at ON public.commitments;
CREATE TRIGGER update_commitments_updated_at BEFORE UPDATE ON public.commitments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_onboarding_progress_updated_at ON public.onboarding_progress;
CREATE TRIGGER update_onboarding_progress_updated_at BEFORE UPDATE ON public.onboarding_progress 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- RPC FUNCTIONS
-- ================================================================

-- Get user context for AI prompts
CREATE OR REPLACE FUNCTION get_user_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'full_name', p.full_name,
        'vision', p.vision,
        'work_style', p.work_style,
        'support_style', p.support_style,
        'daily_priorities', p.daily_priorities,
        'lifestyle_issues', p.lifestyle_issues,
        'stress_response', p.stress_response
      )
      FROM public.profiles p WHERE p.id = p_user_id
    ),
    'active_goals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'category', g.category,
        'priority', g.priority, 'progress', g.progress
      ))
      FROM public.goals g 
      WHERE g.user_id = p_user_id AND g.status = 'active'
      ORDER BY 
        CASE g.priority 
          WHEN 'critical' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          ELSE 4 
        END,
        g.created_at DESC
      LIMIT 10
    ), '[]'::jsonb),
    'pending_tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'status', t.status,
        'due_date', t.due_date, 'priority', t.priority
      ))
      FROM public.tasks t 
      WHERE t.user_id = p_user_id AND t.status IN ('pending', 'in_progress')
      ORDER BY 
        CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
        t.due_date ASC,
        CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
      LIMIT 15
    ), '[]'::jsonb),
    'active_commitments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'description', c.description, 'category', c.category,
        'consistency_score', c.consistency_score
      ))
      FROM public.commitments c 
      WHERE c.user_id = p_user_id AND c.status = 'active'
      ORDER BY c.created_at DESC
      LIMIT 10
    ), '[]'::jsonb),
    'execution_patterns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'pattern', ep.pattern, 'frequency', ep.frequency, 
        'severity', ep.severity, 'behavioral_impact', ep.behavioral_impact
      ))
      FROM public.execution_patterns ep 
      WHERE ep.user_id = p_user_id
      ORDER BY ep.occurrences DESC, ep.last_detected DESC
      LIMIT 5
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- Generate daily tasks for a user
CREATE OR REPLACE FUNCTION generate_daily_tasks(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tasks_created INTEGER := 0;
  v_goal RECORD;
BEGIN
  -- Check if tasks already generated for today
  IF EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE user_id = p_user_id 
    AND due_date = p_date 
    AND auto_generated = true
  ) THEN
    RETURN 0; -- Already generated
  END IF;

  -- Generate task for each active goal
  FOR v_goal IN 
    SELECT id, title, category, priority 
    FROM public.goals 
    WHERE user_id = p_user_id 
    AND status = 'active'
    ORDER BY 
      CASE priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        ELSE 4 
      END
    LIMIT 3  -- Max 3 tasks per day
  LOOP
    INSERT INTO public.tasks (
      user_id, goal_id, title, description, status, priority,
      due_date, auto_generated, generation_reason
    ) VALUES (
      p_user_id, v_goal.id,
      'Progress on: ' || v_goal.title,
      'Daily task auto-generated based on your goal in ' || v_goal.category,
      'pending',
      v_goal.priority,
      p_date,
      true,
      'daily_auto_generation'
    );
    
    v_tasks_created := v_tasks_created + 1;
  END LOOP;

  -- Log generation
  INSERT INTO public.task_generation_log (
    user_id, generation_date, tasks_generated, generation_reason, status
  ) VALUES (
    p_user_id, p_date, v_tasks_created, 'daily_auto_generation', 'success'
  );

  RETURN v_tasks_created;
END;
$$;

-- ================================================================
-- GRANT PERMISSIONS
-- ================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
