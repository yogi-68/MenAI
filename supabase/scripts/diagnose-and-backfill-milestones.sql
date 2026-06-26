-- MenAI milestone + plan diagnostics
-- Safe to run entire file in Supabase SQL Editor (no manual UUID placeholders).
--
-- Optional: filter to one user by setting target_user_id below (leave NULL = all users).

-- =============================================================================
-- STEP 0: Pick a user (copy id if you need it for admin backfill API)
-- =============================================================================
SELECT p.id AS user_id,
       au.email,
       p.full_name,
       p.onboarding_completed,
       p.updated_at
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 20;

-- =============================================================================
-- STEP 1: Active execution goals missing milestones (all users)
-- =============================================================================
SELECT g.id AS goal_id,
       g.user_id,
       au.email,
       g.title,
       g.target_date,
       g.goal_kind,
       g.status,
       COUNT(m.id) AS milestone_count
FROM public.goals g
LEFT JOIN public.goal_milestones m ON m.goal_id = g.id
LEFT JOIN auth.users au ON au.id = g.user_id
WHERE g.status = 'active'
  AND g.goal_kind = 'execution'
GROUP BY g.id, g.user_id, au.email
HAVING COUNT(m.id) = 0
ORDER BY g.created_at DESC;

-- =============================================================================
-- STEP 2: Top mentor memories per user (planner personalization source)
-- Uses most recently updated profile when run as-is.
-- To inspect a specific user, replace the subquery with: 'your-uuid'::uuid
-- =============================================================================
SELECT mm.user_id,
       au.email,
       mm.memory_type,
       mm.text,
       ROUND(mm.influence_score::numeric, 2) AS influence_score,
       mm.last_mentioned_at,
       mm.status
FROM public.mentor_memories mm
LEFT JOIN auth.users au ON au.id = mm.user_id
WHERE mm.user_id = (
  SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1
)
  AND mm.status IN ('active', 'supporting')
ORDER BY mm.influence_score DESC NULLS LAST
LIMIT 5;

-- =============================================================================
-- STEP 3: Today's cached plans — task counts (all users, stale regen candidates)
-- =============================================================================
SELECT dp.user_id,
       au.email,
       dp.id AS plan_id,
       dp.plan_date,
       jsonb_array_length(COALESCE(dp.plan_content->'tasks', '[]'::jsonb)) AS task_count,
       (dp.plan_content->>'planVersion') AS plan_version,
       dp.created_at
FROM public.daily_plans dp
LEFT JOIN auth.users au ON au.id = dp.user_id
WHERE dp.plan_date = CURRENT_DATE
ORDER BY dp.created_at DESC;

-- =============================================================================
-- STEP 4: Tasks per goal today (should be 3 each) — all active execution goals
-- =============================================================================
SELECT g.user_id,
       au.email,
       g.id AS goal_id,
       g.title,
       COUNT(t.id) FILTER (
         WHERE t.status IN ('pending', 'in_progress', 'completed')
       ) AS tasks_today,
       CASE
         WHEN COUNT(t.id) FILTER (
           WHERE t.status IN ('pending', 'in_progress', 'completed')
         ) = 3 THEN 'ok'
         ELSE 'needs_regen'
       END AS status
FROM public.goals g
LEFT JOIN public.tasks t
  ON t.goal_id = g.id
 AND t.user_id = g.user_id
 AND t.due_date = CURRENT_DATE
LEFT JOIN auth.users au ON au.id = g.user_id
WHERE g.status = 'active'
  AND g.goal_kind = 'execution'
GROUP BY g.id, g.user_id, au.email, g.title
ORDER BY tasks_today ASC, g.title;

-- =============================================================================
-- STEP 5: Goal progress snapshots (042) — sanity check
-- =============================================================================
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'goal_progress_snapshots'
) AS goal_progress_snapshots_table_exists;

SELECT gps.user_id,
       au.email,
       g.title AS goal_title,
       gps.snapshot_date,
       gps.progress_pct,
       gps.tasks_completed_count
FROM public.goal_progress_snapshots gps
JOIN public.goals g ON g.id = gps.goal_id
LEFT JOIN auth.users au ON au.id = gps.user_id
WHERE gps.snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY gps.snapshot_date DESC, g.title
LIMIT 50;

-- =============================================================================
-- STEP 6: Force-delete today's plan to trigger regen (run only when needed)
-- Replace the UUID below with user_id from STEP 0, then uncomment ONE line.
-- =============================================================================
-- DELETE FROM public.daily_plans
-- WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
--   AND plan_date = CURRENT_DATE;
