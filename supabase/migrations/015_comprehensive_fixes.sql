-- ================================================================
-- COMPREHENSIVE FIXES FOR MENAI
-- This migration addresses all critical issues
-- ================================================================

-- ================================================================
-- 1. ADD EMAIL TO PROFILES TABLE
-- ================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Update handle_new_user function to store email
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
CREATE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================
-- 2. FIX IDENTITY_SIGNALS TABLE - Rename signal_type to type
-- ================================================================
-- Check if signal_type column exists and rename to type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'identity_signals' 
    AND column_name = 'signal_type'
  ) THEN
    ALTER TABLE public.identity_signals RENAME COLUMN signal_type TO type;
  END IF;
END $$;

-- Ensure type column exists
ALTER TABLE public.identity_signals 
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general';

-- Update RLS policy name
DROP POLICY IF EXISTS "Users can view own signals" ON public.identity_signals;
DROP POLICY IF EXISTS "Service role manages signals" ON public.identity_signals;

CREATE POLICY "Users can view own signals" 
  ON public.identity_signals FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages signals" 
  ON public.identity_signals FOR ALL 
  USING (auth.role() = 'service_role');

-- ================================================================
-- 3. ADD TIME FIELD TO TASKS
-- ================================================================
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
CREATE INDEX IF NOT EXISTS idx_tasks_estimated_time ON public.tasks(user_id, estimated_minutes) WHERE estimated_minutes IS NOT NULL;

-- ================================================================
-- 4. CASCADE DELETES - Ensure all user data is deleted when user is deleted
-- ================================================================
-- All tables already have ON DELETE CASCADE, but let's verify critical ones

-- Add deletion log table to track what gets deleted
CREATE TABLE IF NOT EXISTS public.user_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id UUID NOT NULL,
  deletion_timestamp TIMESTAMPTZ DEFAULT NOW(),
  tables_affected TEXT[],
  records_deleted JSONB
);

-- Function to log user deletion
CREATE OR REPLACE FUNCTION log_user_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_records JSONB;
BEGIN
  SELECT jsonb_build_object(
    'goals', (SELECT COUNT(*) FROM public.goals WHERE user_id = OLD.id),
    'tasks', (SELECT COUNT(*) FROM public.tasks WHERE user_id = OLD.id),
    'conversations', (SELECT COUNT(*) FROM public.conversations WHERE user_id = OLD.id),
    'messages', (SELECT COUNT(*) FROM public.messages WHERE user_id = OLD.id),
    'memories', (SELECT COUNT(*) FROM public.memories WHERE user_id = OLD.id),
    'commitments', (SELECT COUNT(*) FROM public.commitments WHERE user_id = OLD.id),
    'identity_signals', (SELECT COUNT(*) FROM public.identity_signals WHERE user_id = OLD.id),
    'execution_patterns', (SELECT COUNT(*) FROM public.execution_patterns WHERE user_id = OLD.id)
  ) INTO v_records;
  
  INSERT INTO public.user_deletion_log (
    deleted_user_id,
    tables_affected,
    records_deleted
  ) VALUES (
    OLD.id,
    ARRAY['profiles', 'goals', 'tasks', 'conversations', 'messages', 'memories', 'commitments', 'identity_signals', 'execution_patterns'],
    v_records
  );
  
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS before_profile_delete ON public.profiles;
CREATE TRIGGER before_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION log_user_deletion();

-- ================================================================
-- 5. CONVERSATION-SPECIFIC DELETION
-- ================================================================
-- When deleting a conversation, only delete messages and memories tied to that conversation
-- Messages already cascade via conversation_id FK
-- Add conversation_id to memories for better tracking

ALTER TABLE public.memories 
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_memories_conversation ON public.memories(conversation_id) WHERE conversation_id IS NOT NULL;

-- ================================================================
-- 6. IMPROVED TASK GENERATION FUNCTION
-- ================================================================
-- This generates SPECIFIC, ACTIONABLE tasks, not generic goal restatements
CREATE OR REPLACE FUNCTION generate_daily_tasks(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tasks_created INTEGER := 0;
  v_goal RECORD;
  v_task_title TEXT;
  v_task_description TEXT;
  v_goal_keywords TEXT[];
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

  -- Generate specific actionable tasks for each active goal
  FOR v_goal IN 
    SELECT id, title, category, priority, description
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
    -- Generate specific task based on goal category
    CASE v_goal.category
      WHEN 'career_work' THEN
        v_task_title := 'Complete 1 key milestone for: ' || v_goal.title;
        v_task_description := 'Identify and complete one concrete step that moves you closer to this goal. This could be: writing code, reaching out to a contact, finishing a project component, or making a key decision.';
      WHEN 'finances' THEN
        v_task_title := 'Take 1 financial action for: ' || v_goal.title;
        v_task_description := 'Complete one specific financial action today. Examples: track expenses, research an investment, negotiate a rate, set up automation, or review your budget.';
      WHEN 'health_fitness' THEN
        v_task_title := 'Complete your health routine for: ' || v_goal.title;
        v_task_description := 'Follow through on your planned health activity: workout session, meal prep, meditation, or health tracking.';
      WHEN 'learning' THEN
        v_task_title := 'Study/practice for: ' || v_goal.title;
        v_task_description := 'Dedicate focused time to learning. Complete a lesson, practice a skill, or review material.';
      WHEN 'relationships' THEN
        v_task_title := 'Connect meaningfully for: ' || v_goal.title;
        v_task_description := 'Reach out, have a quality conversation, or take action to strengthen this relationship.';
      WHEN 'personal_growth' THEN
        v_task_title := 'Work on: ' || v_goal.title;
        v_task_description := 'Take one concrete action toward personal development in this area.';
      WHEN 'creativity' THEN
        v_task_title := 'Create something for: ' || v_goal.title;
        v_task_description := 'Spend dedicated time on creative work. Ship, build, or make progress on your creative project.';
      ELSE
        v_task_title := 'Make progress on: ' || v_goal.title;
        v_task_description := 'Complete one specific, measurable action that moves this goal forward today.';
    END CASE;
    
    INSERT INTO public.tasks (
      user_id, goal_id, title, description, status, priority,
      due_date, auto_generated, generation_reason, estimated_minutes
    ) VALUES (
      p_user_id, v_goal.id,
      v_task_title,
      v_task_description,
      'pending',
      v_goal.priority,
      p_date,
      true,
      'daily_auto_generation',
      60  -- Default 1 hour estimate
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
-- 7. LIMIT DAILY PLANS TO ONE PER DAY
-- ================================================================
-- Already has unique index (idx_daily_plans_unique), but add check constraint
ALTER TABLE public.daily_plans DROP CONSTRAINT IF EXISTS one_plan_per_day;

-- Add function to prevent unlimited plan generation
CREATE OR REPLACE FUNCTION check_daily_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.daily_plans
  WHERE user_id = NEW.user_id
  AND plan_date = NEW.plan_date;
  
  IF v_count >= 1 THEN
    RAISE EXCEPTION 'Only one plan allowed per day. Update existing plan instead.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_daily_plan_limit ON public.daily_plans;
CREATE TRIGGER enforce_daily_plan_limit
  BEFORE INSERT ON public.daily_plans
  FOR EACH ROW EXECUTE FUNCTION check_daily_plan_limit();

-- ================================================================
-- 8. ADD COMPLETION TRACKING FOR TASKS
-- ================================================================
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON public.tasks(user_id, completed_at) WHERE completed_at IS NOT NULL;

-- Update task completion trigger
CREATE OR REPLACE FUNCTION update_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at := NOW();
    NEW.last_completed_at := NOW();
  ELSIF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_completion_timestamp ON public.tasks;
CREATE TRIGGER task_completion_timestamp
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_task_completion();

-- ================================================================
-- 9. SOFT DELETE FOR CONVERSATIONS (optional - for recovery)
-- ================================================================
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_conversations_not_deleted ON public.conversations(user_id, deleted_at) WHERE deleted_at IS NULL;

-- ================================================================
-- 10. COMMITMENTS TRACKING
-- ================================================================
-- Ensure commitments are properly set up for dynamic tracking
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS last_checked_date DATE;
ALTER TABLE public.commitments ADD COLUMN IF NOT EXISTS target_frequency TEXT; -- 'daily', 'weekly', etc.

-- ================================================================
-- 11. FIX TASK QUERY PERFORMANCE
-- ================================================================
-- Add composite index for common dashboard query
CREATE INDEX IF NOT EXISTS idx_tasks_dashboard 
  ON public.tasks(user_id, status, due_date, priority) 
  WHERE status IN ('pending', 'in_progress');

-- ================================================================
-- 12. USER REPORTS TABLE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  report_date DATE NOT NULL,
  report_data JSONB NOT NULL,
  consistency_score NUMERIC(5,2),
  completion_percentage NUMERIC(5,2),
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports ON public.user_reports(user_id, report_type, report_date DESC);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own reports" ON public.user_reports;
CREATE POLICY "Users can view own reports" ON public.user_reports FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages reports" ON public.user_reports;
CREATE POLICY "Service role manages reports" ON public.user_reports FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- 13. UPDATE PERMISSIONS
-- ================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ================================================================
-- VERIFICATION QUERIES
-- ================================================================
-- Run these to verify the migration worked:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'identity_signals' AND column_name = 'type';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'estimated_minutes';
