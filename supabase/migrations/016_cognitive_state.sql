-- ================================================================
-- Migration 016: Add cognitive_state JSONB column to profiles
-- This persists the deep synthesis result from the Cognition Engine
-- so it survives Redis evictions and cold starts.
-- ================================================================

-- Add cognitive_state column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS cognitive_state JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.cognitive_state IS 'Persisted cognitive state from the Cognition Engine deep synthesis. Updated nightly or on major events.';

-- Index for checking if cognitive state exists (used by dashboard)
CREATE INDEX IF NOT EXISTS idx_profiles_cognitive_state_exists
ON profiles ((cognitive_state IS NOT NULL))
WHERE cognitive_state IS NOT NULL;
