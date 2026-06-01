-- MenAI memory inspection — run in Supabase SQL Editor
-- IMPORTANT: Replace NOTHING with '<user_id>'. Use Step 1 to get a real UUID.

-- =============================================================================
-- STEP 1: Find your user UUID (pick one row — copy the id column)
-- =============================================================================
SELECT p.id AS user_id, au.email, p.full_name, p.updated_at
FROM public.profiles p
LEFT JOIN auth.users au ON au.id = p.id
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 20;

-- =============================================================================
-- STEP 2: Paste UUID below (example format only — use YOUR id from Step 1)
-- In Supabase you can also use a subquery instead of pasting:
-- =============================================================================

-- Option A: inspect the most recently active user (no manual UUID)
-- Uncomment and run blocks below — they use a subquery automatically.

-- --- Structured mentor memory (beliefs, values, directions — NOT vectors) ---
SELECT
  memory_type,
  status,
  ROUND(influence_score::numeric, 2) AS influence,
  mention_count,
  last_mentioned_at,
  expires_at,
  LEFT(text, 80) AS text_preview
FROM public.mentor_memories
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
ORDER BY influence_score DESC NULLS LAST, last_mentioned_at DESC
LIMIT 30;

-- --- Execution patterns (overthinking, reactive_schedule, etc.) ---
SELECT
  pattern,
  status,
  ROUND(COALESCE(influence_score, confidence)::numeric, 2) AS influence,
  occurrences,
  ROUND(confidence::numeric, 2) AS confidence,
  last_mentioned_at,
  last_detected
FROM public.execution_patterns
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
ORDER BY COALESCE(influence_score, 0) DESC, occurrences DESC
LIMIT 20;

-- --- Vector semantic memory (pgvector embeddings — conversation recall) ---
SELECT
  memory_type,
  LEFT(content, 100) AS content_preview,
  (embedding IS NOT NULL) AS has_vector,
  metadata->>'importance' AS importance,
  created_at
FROM public.memories
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
ORDER BY created_at DESC
LIMIT 20;

-- --- Life area weights on profile ---
SELECT
  id,
  life_area_weights,
  life_area_last_mentioned,
  user_model_updated_at,
  current_focus_initiative_id
FROM public.profiles
WHERE id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1);

-- --- Active goals & initiatives ---
SELECT 'goal' AS kind, title, status, category, created_at
FROM public.goals
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
  AND status = 'active'
UNION ALL
SELECT 'initiative', title, status, life_area, created_at
FROM public.initiatives
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
  AND status = 'active'
ORDER BY created_at DESC;

-- --- Identity signals ---
SELECT description, long_term_direction, status, confidence, created_at
FROM public.identity_signals
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
ORDER BY created_at DESC
LIMIT 15;

-- --- Recent chat messages (raw input) ---
SELECT m.role, LEFT(m.content, 120) AS content_preview, m.created_at
FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
WHERE c.user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
ORDER BY m.created_at DESC
LIMIT 15;

-- --- Row counts summary ---
SELECT 'mentor_memories' AS table_name, COUNT(*) AS rows
FROM public.mentor_memories
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
UNION ALL
SELECT 'execution_patterns', COUNT(*) FROM public.execution_patterns
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
UNION ALL
SELECT 'memories (vectors)', COUNT(*) FROM public.memories
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
UNION ALL
SELECT 'messages', COUNT(*) FROM public.messages m
JOIN public.conversations c ON c.id = m.conversation_id
WHERE c.user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1)
UNION ALL
SELECT 'goals active', COUNT(*) FROM public.goals
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1) AND status = 'active'
UNION ALL
SELECT 'initiatives active', COUNT(*) FROM public.initiatives
WHERE user_id = (SELECT id FROM public.profiles ORDER BY updated_at DESC NULLS LAST LIMIT 1) AND status = 'active';

-- =============================================================================
-- Option B: If you have your UUID, use it directly (replace the example UUID)
-- =============================================================================
-- SELECT life_area_weights, life_area_last_mentioned
-- FROM public.profiles
-- WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

-- =============================================================================
-- Migration check — run if inserts fail
-- =============================================================================
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('mentor_memories', 'execution_patterns', 'profiles', 'memories')
  AND column_name IN (
    'influence_score', 'status', 'expires_at', 'life_area_last_mentioned', 'embedding'
  )
ORDER BY table_name, column_name;
