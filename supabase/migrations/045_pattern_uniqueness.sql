-- ============================================================================
-- 045 — One row per pattern per user
--
-- Every code path that writes execution_patterns treats (user_id, pattern) as
-- unique: each one selects, then updates if found and inserts if not. But the
-- table only had a plain index on that pair, never a unique constraint. Two
-- concurrent turns detecting the same pattern both find nothing and both
-- insert, and the duplicate splits `occurrences` across rows — so a pattern
-- the user actually repeats ranks lower than one they mentioned once.
--
-- It also broke an upsert outright. /api/confidence/answer passes
-- `onConflict: "user_id,pattern"`, which Postgres rejects with 42P10 when no
-- matching unique constraint exists. That result was never checked, so every
-- obstacle answered through the confidence Q&A was silently discarded.
--
-- Forward-only. Existing duplicates are merged rather than dropped.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Normalize values the CHECK constraint would reject
--
-- The keyword detector emitted 'reactive_schedule', which is not in the
-- vocabulary, so those inserts failed. Any that predate the constraint, or
-- arrived through a path that bypassed it, are folded into the pattern they
-- actually describe. See src/lib/patterns/vocabulary.ts for the same mapping.
-- ----------------------------------------------------------------------------

UPDATE public.execution_patterns
SET pattern = CASE pattern
  WHEN 'reactive_schedule' THEN 'scattered_focus'
  WHEN 'scattered_focus_priorities' THEN 'scattered_focus'
  WHEN 'lack_of_time' THEN 'scattered_focus'
  WHEN 'fear_of_failure' THEN 'avoidance'
  WHEN 'low_energy' THEN 'burnout'
  ELSE pattern
END
WHERE pattern IN (
  'reactive_schedule',
  'scattered_focus_priorities',
  'lack_of_time',
  'fear_of_failure',
  'low_energy'
);

-- Anything still outside the vocabulary cannot be repaired automatically.
-- Archive rather than delete: it is user-derived data, and a human may want
-- to look at what the detectors were producing.
UPDATE public.execution_patterns
SET status = 'archived'
WHERE pattern NOT IN (
  'procrastination', 'overthinking', 'perfectionism',
  'inconsistency', 'scattered_focus', 'avoidance', 'burnout'
);


-- ----------------------------------------------------------------------------
-- 2. Merge duplicates
--
-- Keep the earliest row per (user_id, pattern) so first_detected stays true,
-- and carry the aggregate signal onto it.
-- ----------------------------------------------------------------------------

WITH ranked AS (
  SELECT
    id,
    user_id,
    pattern,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, pattern
      ORDER BY COALESCE(first_detected, created_at) ASC, id ASC
    ) AS rn
  FROM public.execution_patterns
),
survivors AS (
  SELECT id, user_id, pattern FROM ranked WHERE rn = 1
),
merged AS (
  SELECT
    s.id AS keep_id,
    SUM(COALESCE(p.occurrences, 1))          AS total_occurrences,
    MAX(COALESCE(p.confidence, 0.7))         AS best_confidence,
    MAX(COALESCE(p.last_mentioned_at, p.last_detected)) AS latest_mention
  FROM survivors s
  JOIN public.execution_patterns p
    ON p.user_id = s.user_id AND p.pattern = s.pattern
  GROUP BY s.id
)
UPDATE public.execution_patterns AS target
SET
  occurrences       = merged.total_occurrences,
  confidence        = merged.best_confidence,
  last_mentioned_at = merged.latest_mention
FROM merged
WHERE target.id = merged.keep_id;

DELETE FROM public.execution_patterns AS p
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, pattern
      ORDER BY COALESCE(first_detected, created_at) ASC, id ASC
    ) AS rn
  FROM public.execution_patterns
) AS ranked
WHERE p.id = ranked.id AND ranked.rn > 1;


-- ----------------------------------------------------------------------------
-- 3. The constraint the code already assumed
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS execution_patterns_user_pattern_key
  ON public.execution_patterns (user_id, pattern);

-- The old non-unique index on the same pair is now redundant.
DROP INDEX IF EXISTS public.idx_execution_patterns_pattern;


-- ----------------------------------------------------------------------------
-- 4. Columns the writers referenced but the table never had
--
-- /api/confidence/answer wrote `source`, which existed on commitments and
-- goals but not here — a third reason that same call could never succeed.
-- ----------------------------------------------------------------------------

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'chat';

ALTER TABLE public.execution_patterns
  ADD COLUMN IF NOT EXISTS evidence_count INTEGER DEFAULT 1;

COMMENT ON INDEX public.execution_patterns_user_pattern_key IS
  'Every writer treats (user_id, pattern) as unique and upserts on it.';
