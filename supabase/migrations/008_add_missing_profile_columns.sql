-- Add missing columns to profiles table
-- These were referenced in code but missing from schema

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vision TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS founder_mode BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coaching_style TEXT DEFAULT 'balanced' CHECK (coaching_style IN ('balanced', 'push', 'gentle', 'strategic'));

-- Add index for coaching_style queries
CREATE INDEX IF NOT EXISTS idx_profiles_coaching_style ON profiles(coaching_style);

COMMENT ON COLUMN profiles.vision IS 'User long-term vision or life direction';
COMMENT ON COLUMN profiles.founder_mode IS 'Whether user operates in founder/builder mode';
COMMENT ON COLUMN profiles.coaching_style IS 'AI interaction style preference';
