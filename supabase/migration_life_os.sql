-- ================================================================
-- MenAI Life Operating System — Migration
-- Run this in Supabase SQL Editor AFTER the original schema.sql
-- ================================================================

-- ================================================================
-- ADD NEW PROFILE FIELDS
-- ================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vision TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS founder_mode BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coaching_style TEXT DEFAULT 'balanced' CHECK (coaching_style IN ('balanced', 'push', 'gentle', 'strategic'));

-- ================================================================
-- UPDATE MEMORIES MEMORY_TYPE CONSTRAINT
-- ================================================================
ALTER TABLE memories DROP CONSTRAINT IF EXISTS memories_memory_type_check;
ALTER TABLE memories ADD CONSTRAINT memories_memory_type_check 
  CHECK (memory_type IN ('conversation', 'insight', 'preference', 'mood', 'journal', 'goal', 'commitment', 'relationship', 'behavioral', 'identity'));

-- ================================================================
-- GOALS
-- ================================================================
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('startup', 'fitness', 'financial', 'relationship', 'learning', 'identity', 'health', 'career', 'other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'abandoned')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  target_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  extracted_from UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id, status, created_at DESC);

-- ================================================================
-- TASKS
-- ================================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  due_date DATE,
  scheduled_time TIME,
  recurrence TEXT CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'weekdays')),
  streak_count INTEGER DEFAULT 0,
  last_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);

-- ================================================================
-- COMMITMENTS
-- ================================================================
CREATE TABLE IF NOT EXISTS commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  category TEXT CHECK (category IN ('health', 'work', 'relationships', 'personal', 'other')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  consistency_score NUMERIC(5,2) DEFAULT 0,
  times_followed_through INTEGER DEFAULT 0,
  times_broken INTEGER DEFAULT 0,
  extracted_from UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commitments_user ON commitments(user_id, status);

-- ================================================================
-- RELATIONSHIPS (People in user's life)
-- ================================================================
CREATE TABLE IF NOT EXISTS relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('partner', 'parent', 'friend', 'mentor', 'coworker', 'other')),
  emotional_closeness INTEGER CHECK (emotional_closeness IS NULL OR (emotional_closeness >= 1 AND emotional_closeness <= 10)),
  notes TEXT,
  last_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);

-- ================================================================
-- DAILY PLANS (AI-generated execution plans)
-- ================================================================
CREATE TABLE IF NOT EXISTS daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  plan_content JSONB NOT NULL,
  ai_notes TEXT,
  completion_score INTEGER CHECK (completion_score IS NULL OR (completion_score >= 0 AND completion_score <= 100)),
  energy_level INTEGER CHECK (energy_level IS NULL OR (energy_level >= 1 AND energy_level <= 10)),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_user ON daily_plans(user_id, plan_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plans_unique ON daily_plans(user_id, plan_date);

-- ================================================================
-- ACCOUNTABILITY LOG
-- ================================================================
CREATE TABLE IF NOT EXISTS accountability_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  commitment_id UUID REFERENCES commitments(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('followed_through', 'missed', 'partial', 'rescheduled')),
  ai_observation TEXT,
  user_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accountability_user ON accountability_log(user_id, created_at DESC);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE accountability_log ENABLE ROW LEVEL SECURITY;

-- Goals: users can manage their own
CREATE POLICY "Users can manage own goals" ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages goals" ON goals FOR ALL USING (auth.role() = 'service_role');

-- Tasks: users can manage their own
CREATE POLICY "Users can manage own tasks" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages tasks" ON tasks FOR ALL USING (auth.role() = 'service_role');

-- Commitments: users can manage their own
CREATE POLICY "Users can manage own commitments" ON commitments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages commitments" ON commitments FOR ALL USING (auth.role() = 'service_role');

-- Relationships: users can manage their own
CREATE POLICY "Users can manage own relationships" ON relationships FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages relationships" ON relationships FOR ALL USING (auth.role() = 'service_role');

-- Daily plans: users can manage their own
CREATE POLICY "Users can manage own plans" ON daily_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role manages plans" ON daily_plans FOR ALL USING (auth.role() = 'service_role');

-- Accountability log: users can view own, service role manages
CREATE POLICY "Users can view own accountability" ON accountability_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages accountability" ON accountability_log FOR ALL USING (auth.role() = 'service_role');

-- ================================================================
-- TRIGGERS
-- ================================================================

CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ================================================================
-- RPC: Get user's life context for prompt injection
-- ================================================================
CREATE OR REPLACE FUNCTION get_life_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'active_goals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'category', g.category,
        'priority', g.priority, 'progress', g.progress, 'target_date', g.target_date
      ))
      FROM goals g WHERE g.user_id = p_user_id AND g.status = 'active'
      ORDER BY g.priority DESC, g.created_at DESC
      LIMIT 10
    ), '[]'::jsonb),
    'pending_tasks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'status', t.status,
        'due_date', t.due_date, 'streak_count', t.streak_count
      ))
      FROM tasks t WHERE t.user_id = p_user_id AND t.status IN ('pending', 'in_progress')
      ORDER BY t.due_date ASC NULLS LAST
      LIMIT 15
    ), '[]'::jsonb),
    'active_commitments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'description', c.description, 'category', c.category,
        'consistency_score', c.consistency_score,
        'times_followed_through', c.times_followed_through,
        'times_broken', c.times_broken
      ))
      FROM commitments c WHERE c.user_id = p_user_id AND c.status = 'active'
      ORDER BY c.created_at DESC
      LIMIT 10
    ), '[]'::jsonb),
    'relationships', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', r.name, 'role', r.role,
        'emotional_closeness', r.emotional_closeness,
        'last_mentioned', r.last_mentioned_at
      ))
      FROM relationships r WHERE r.user_id = p_user_id
      ORDER BY r.last_mentioned_at DESC NULLS LAST
      LIMIT 10
    ), '[]'::jsonb),
    'todays_plan', (
      SELECT jsonb_build_object(
        'id', dp.id, 'plan_content', dp.plan_content,
        'completion_score', dp.completion_score, 'energy_level', dp.energy_level
      )
      FROM daily_plans dp WHERE dp.user_id = p_user_id AND dp.plan_date = CURRENT_DATE
      LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$$;
