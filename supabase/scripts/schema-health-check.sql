-- MenAI schema health check (run in Supabase SQL editor or via MCP execute_sql)
-- Confirms columns required by chat extraction, coach rail, and score pipeline exist.

SELECT 'goals.target_date' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'goals' AND column_name = 'target_date'
       ) AS ok;

SELECT 'tasks.status/completed_at/auto_generated' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'tasks'
           AND column_name IN ('status', 'completed_at', 'auto_generated')
         HAVING COUNT(*) = 3
       ) AS ok;

SELECT 'profiles.user_model' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_model'
       ) AS ok;

SELECT 'messages + conversations (041)' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'messages'
       )
       AND EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'conversations'
       ) AS ok;

-- Sample: goals missing deadlines (informational)
SELECT id, title, target_date
FROM goals
WHERE status = 'active' AND target_date IS NULL
ORDER BY created_at DESC
LIMIT 10;
