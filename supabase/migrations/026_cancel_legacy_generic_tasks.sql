-- Cancel legacy generic goal tasks (pre–AI daily plan) and dedupe pending rows.

UPDATE public.tasks
SET status = 'cancelled', updated_at = NOW()
WHERE status IN ('pending', 'in_progress')
  AND COALESCE(auto_generated, false) = false
  AND (
    title ILIKE 'Make progress on:%'
    OR title ILIKE 'Progress on:%'
    OR title ILIKE 'Complete 1 key milestone for:%'
    OR title ILIKE 'Take 1 financial action for:%'
  );

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, lower(trim(title))
      ORDER BY
        CASE WHEN due_date = CURRENT_DATE THEN 0 ELSE 1 END,
        COALESCE(auto_generated, false) DESC,
        created_at ASC
    ) AS rn
  FROM public.tasks
  WHERE status IN ('pending', 'in_progress')
)
UPDATE public.tasks t
SET status = 'cancelled', updated_at = NOW()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;
