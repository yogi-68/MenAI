-- ================================================================
-- VERIFICATION SCRIPT FOR ALL FIXES
-- Run this in Supabase SQL Editor after applying migrations
-- Replace 'YOUR_USER_ID' with your actual user ID throughout
-- ================================================================

-- ================================================================
-- STEP 1: Verify identity_signals table structure
-- ================================================================
SELECT 
  'identity_signals column check' AS test_name,
  column_name, 
  data_type,
  CASE 
    WHEN column_name = 'type' THEN '✓ CORRECT'
    WHEN column_name = 'signal_type' THEN '✗ WRONG - Need to apply migration 013'
    ELSE 'INFO'
  END AS status
FROM information_schema.columns 
WHERE table_name = 'identity_signals'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- ================================================================
-- STEP 2: Check if onboarding functions exist
-- ================================================================
SELECT 
  'onboarding functions check' AS test_name,
  routine_name AS function_name,
  '✓ EXISTS' AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('complete_onboarding', 'is_onboarding_complete')
ORDER BY routine_name;

-- Expected: 2 rows (complete_onboarding and is_onboarding_complete)
-- If missing, apply migration 014

-- ================================================================
-- STEP 3: Get your user ID (if you don't know it)
-- ================================================================
SELECT 
  'current users' AS info,
  id AS user_id, 
  email,
  created_at
FROM auth.users 
ORDER BY created_at DESC
LIMIT 10;

-- Copy your user_id from above and replace 'YOUR_USER_ID' below

-- ================================================================
-- STEP 4: Check your onboarding status
-- ================================================================
SELECT 
  'onboarding status check' AS test_name,
  p.id AS user_id,
  p.full_name,
  p.onboarding_completed,
  CASE 
    WHEN p.onboarding_completed = true THEN '✓ COMPLETED'
    ELSE '✗ NOT COMPLETED'
  END AS status,
  prog.completed_at AS progress_completed_at,
  prog.current_question_id,
  COALESCE(jsonb_array_length(prog.completed_questions), 0) AS questions_answered,
  p.created_at AS profile_created
FROM profiles p
LEFT JOIN onboarding_progress prog ON prog.user_id = p.id
WHERE p.id = 'YOUR_USER_ID';

-- If onboarding_completed is false but you completed it, run:
-- SELECT complete_onboarding('YOUR_USER_ID');

-- ================================================================
-- STEP 5: Check onboarding responses
-- ================================================================
SELECT 
  'onboarding responses check' AS test_name,
  user_id,
  COUNT(*) AS total_responses,
  COUNT(DISTINCT question_id) AS unique_questions,
  COUNT(*) FILTER (WHERE processed = true) AS processed_count,
  COUNT(*) FILTER (WHERE processed = false) AS unprocessed_count,
  MAX(created_at) AS last_response_at
FROM onboarding_responses 
WHERE user_id = 'YOUR_USER_ID'
GROUP BY user_id;

-- Should show at least 5 unique questions if onboarding was completed

-- ================================================================
-- STEP 6: Check extracted data from onboarding
-- ================================================================

-- Goals
SELECT 
  'goals from onboarding' AS data_type,
  COUNT(*) AS count,
  json_agg(json_build_object(
    'title', title,
    'category', category,
    'status', status,
    'source', source
  )) AS data
FROM goals 
WHERE user_id = 'YOUR_USER_ID';

-- Commitments
SELECT 
  'commitments from onboarding' AS data_type,
  COUNT(*) AS count,
  json_agg(json_build_object(
    'description', description,
    'category', category,
    'status', status
  )) AS data
FROM commitments 
WHERE user_id = 'YOUR_USER_ID';

-- Identity Signals (THIS SHOULD NOW WORK WITHOUT 400 ERROR!)
SELECT 
  'identity signals' AS data_type,
  COUNT(*) AS count,
  json_agg(json_build_object(
    'type', type,
    'description', description,
    'long_term_direction', long_term_direction,
    'confidence', confidence
  )) AS data
FROM identity_signals 
WHERE user_id = 'YOUR_USER_ID';

-- Execution Patterns
SELECT 
  'execution patterns' AS data_type,
  COUNT(*) AS count,
  json_agg(json_build_object(
    'pattern', pattern,
    'frequency', frequency,
    'severity', severity,
    'behavioral_impact', behavioral_impact
  )) AS data
FROM execution_patterns 
WHERE user_id = 'YOUR_USER_ID';

-- ================================================================
-- STEP 7: Test daily task generation
-- ================================================================

-- Check if tasks already exist for today
SELECT 
  'existing tasks today' AS test_name,
  COUNT(*) AS task_count,
  COUNT(*) FILTER (WHERE auto_generated = true) AS auto_generated_count,
  json_agg(json_build_object(
    'title', title,
    'status', status,
    'auto_generated', auto_generated
  )) AS tasks
FROM tasks 
WHERE user_id = 'YOUR_USER_ID'
  AND due_date = CURRENT_DATE;

-- Generate daily tasks (will skip if already generated today)
SELECT 
  'generate daily tasks' AS action,
  generate_daily_tasks('YOUR_USER_ID') AS tasks_created;

-- Check generation log
SELECT 
  'task generation log' AS test_name,
  generation_date,
  tasks_generated,
  status,
  generation_reason,
  error_message,
  created_at
FROM task_generation_log 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC
LIMIT 5;

-- ================================================================
-- STEP 8: Verify profile data
-- ================================================================
SELECT 
  'profile data check' AS test_name,
  id,
  full_name,
  onboarding_completed,
  vision,
  founder_mode,
  coaching_style,
  support_style,
  daily_priorities,
  lifestyle_issues,
  created_at,
  updated_at
FROM profiles 
WHERE id = 'YOUR_USER_ID';

-- ================================================================
-- STEP 9: Test the identity_signals query that was failing
-- ================================================================

-- This is the EXACT query that was causing 400 error
-- It should now work correctly
SELECT 
  type,
  description,
  long_term_direction,
  confidence
FROM identity_signals
WHERE user_id = 'YOUR_USER_ID'
  AND confidence >= 0.65
ORDER BY confidence DESC
LIMIT 3;

-- ================================================================
-- STEP 10: Summary Report
-- ================================================================
WITH user_data AS (
  SELECT 
    'YOUR_USER_ID'::uuid AS uid,
    (SELECT onboarding_completed FROM profiles WHERE id = 'YOUR_USER_ID') AS onboarding_done,
    (SELECT COUNT(*) FROM goals WHERE user_id = 'YOUR_USER_ID' AND status = 'active') AS active_goals,
    (SELECT COUNT(*) FROM commitments WHERE user_id = 'YOUR_USER_ID' AND status = 'active') AS active_commitments,
    (SELECT COUNT(*) FROM identity_signals WHERE user_id = 'YOUR_USER_ID') AS identity_signals,
    (SELECT COUNT(*) FROM execution_patterns WHERE user_id = 'YOUR_USER_ID') AS execution_patterns,
    (SELECT COUNT(*) FROM tasks WHERE user_id = 'YOUR_USER_ID' AND due_date = CURRENT_DATE) AS tasks_today,
    (SELECT COUNT(*) FROM onboarding_responses WHERE user_id = 'YOUR_USER_ID') AS onboarding_responses
)
SELECT 
  'SYSTEM HEALTH CHECK' AS report_title,
  CASE 
    WHEN onboarding_done = true THEN '✓ Onboarding Complete'
    ELSE '✗ Onboarding Incomplete'
  END AS onboarding_status,
  active_goals || ' active goals' AS goals_status,
  active_commitments || ' active commitments' AS commitments_status,
  identity_signals || ' identity signals' AS identity_status,
  execution_patterns || ' execution patterns' AS patterns_status,
  tasks_today || ' tasks today' AS tasks_status,
  onboarding_responses || ' onboarding responses' AS responses_status,
  CASE 
    WHEN onboarding_done = true 
         AND active_goals > 0 
         AND identity_signals > 0 
    THEN '✓✓✓ ALL SYSTEMS OPERATIONAL'
    WHEN onboarding_done = true 
    THEN '⚠ Onboarding complete but data extraction may be incomplete'
    ELSE '✗ Complete onboarding first'
  END AS overall_status
FROM user_data;

-- ================================================================
-- TROUBLESHOOTING COMMANDS
-- ================================================================

-- If onboarding shows incomplete but you finished it:
-- Uncomment and run:
-- SELECT complete_onboarding('YOUR_USER_ID');

-- If identity_signals query still fails with 400:
-- Check if column is still named signal_type:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'identity_signals';
-- If you see 'signal_type', migration 013 wasn't applied yet

-- Force reprocess onboarding responses:
-- UPDATE onboarding_responses 
-- SET processed = false 
-- WHERE user_id = 'YOUR_USER_ID';

-- Clear today's auto-generated tasks (to regenerate):
-- DELETE FROM tasks 
-- WHERE user_id = 'YOUR_USER_ID' 
--   AND due_date = CURRENT_DATE 
--   AND auto_generated = true;

-- ================================================================
-- END OF VERIFICATION SCRIPT
-- ================================================================

SELECT '
╔═══════════════════════════════════════════════════════════════╗
║                  VERIFICATION COMPLETE                        ║
║                                                               ║
║  Review the results above. Look for:                          ║
║  - ✓ marks indicating correct configuration                   ║
║  - ✗ marks indicating issues that need attention              ║
║                                                               ║
║  If any checks failed:                                        ║
║  1. Apply missing migrations (013, 014)                       ║
║  2. Run complete_onboarding() if needed                       ║
║  3. Clear browser cache and re-login                          ║
║                                                               ║
║  Questions? Check FIXES_APPLIED.md for troubleshooting        ║
╚═══════════════════════════════════════════════════════════════╝
' AS verification_complete;
