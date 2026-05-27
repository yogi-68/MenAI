-- ================================================================
-- Verification Script: Check if all required columns exist
-- Run this BEFORE applying the fix to see what's missing
-- Run this AFTER applying the fix to verify everything is there
-- ================================================================

-- Check tasks table columns
SELECT 
  'tasks' as table_name,
  column_name,
  data_type,
  CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable,
  COALESCE(column_default, 'NO DEFAULT') as default_value
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND column_name IN ('goal_id', 'priority', 'auto_generated', 'generation_reason', 'updated_at')
ORDER BY column_name;

-- Expected: 5 rows (goal_id, priority, auto_generated, generation_reason, updated_at)

-- Check profiles table columns
SELECT 
  'profiles' as table_name,
  column_name,
  data_type,
  CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('vision', 'founder_mode', 'coaching_style', 'lifestyle_issues', 
                      'stress_response', 'work_style', 'daily_priorities', 
                      'support_style', 'reflection_frequency')
ORDER BY column_name;

-- Expected: 9 rows

-- Check commitments table columns
SELECT 
  'commitments' as table_name,
  column_name,
  data_type,
  CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'commitments'
  AND column_name IN ('timeframe', 'source', 'updated_at')
ORDER BY column_name;

-- Expected: 3 rows

-- Check goals table columns
SELECT 
  'goals' as table_name,
  column_name,
  data_type,
  CASE WHEN is_nullable = 'YES' THEN 'NULL' ELSE 'NOT NULL' END as nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'goals'
  AND column_name IN ('source', 'updated_at')
ORDER BY column_name;

-- Expected: 2 rows

-- Check for indexes
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('tasks', 'profiles', 'goals', 'commitments')
  AND indexname IN ('idx_tasks_goal', 'idx_tasks_auto_gen', 'idx_tasks_user_status_date',
                    'idx_profiles_coaching_style', 'idx_goals_user_status', 
                    'idx_commitments_user_status')
ORDER BY tablename, indexname;

-- Expected: 6 rows

-- Check for triggers
SELECT 
  trigger_name,
  event_object_table as table_name,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('update_tasks_updated_at', 'update_commitments_updated_at', 
                       'update_goals_updated_at')
ORDER BY event_object_table, trigger_name;

-- Expected: 3 rows

-- Check foreign key constraint
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'tasks'
  AND kcu.column_name = 'goal_id';

-- Expected: 1 row (tasks.goal_id -> goals.id)

-- ================================================================
-- Summary Query
-- ================================================================
SELECT 
  'BEFORE FIX: If you see 0 rows, columns are missing' as status
UNION ALL
SELECT 
  'AFTER FIX: If you see 5 rows, fix was successful' as status;

-- Check overall column count
SELECT COUNT(*) as tasks_required_columns_found
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
  AND column_name IN ('goal_id', 'priority', 'auto_generated', 'generation_reason', 'updated_at');

-- Should return 5 if all columns exist, less if columns are missing
