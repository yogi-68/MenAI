-- MenAI V2: Verify migrations 039 + 040 + 041 + 042 applied correctly
-- Run in Supabase SQL Editor after applying migrations through 042_goal_progress_snapshots.sql

-- Goals table has V2 columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'goals'
  AND column_name IN (
    'description', 'target_date', 'goal_kind', 'life_area',
    'parent_goal_id', 'goal_stage', 'success_criteria'
  )
ORDER BY column_name;

-- Tasks: goal_id only (no initiative_id)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tasks'
  AND column_name IN ('goal_id', 'initiative_id');

-- Initiatives table should be gone
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'initiatives'
) AS initiatives_table_still_exists;

-- Execution goals migrated
SELECT COUNT(*) AS execution_goal_count
FROM public.goals
WHERE goal_kind = 'execution';

-- Milestones renamed
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'goal_milestones'
) AS goal_milestones_exists;

-- Memory persistence columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mentor_memories'
  AND column_name IN ('is_permanent', 'memory_class');

-- Coaching style removed from profiles
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('coaching_style', 'founder_mode', 'current_focus_goal_id');

-- Chat tables (041)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'messages'
) AS messages_table_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'crisis_events'
) AS crisis_events_table_exists;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'messages'
  AND column_name IN ('conversation_id', 'user_id', 'role', 'content', 'emotion_data')
ORDER BY column_name;

-- Goal progress snapshots (042)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'goal_progress_snapshots'
) AS goal_progress_snapshots_exists;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'goal_progress_snapshots'
  AND column_name IN ('goal_id', 'snapshot_date', 'progress_pct', 'tasks_completed_count')
ORDER BY column_name;
