-- MenAI Master Alignment Migration
-- Adds identity_signals, execution_patterns, and context_confidence_log tables
-- Run this after migration_life_os.sql

-- ===== Identity Signals Table =====
-- Tracks user identity aspirations extracted from conversations
-- Examples: founder ambition, creator mindset, self-discipline goals, leadership

CREATE TABLE IF NOT EXISTS identity_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('founder', 'creator', 'self-discipline', 'leadership', 'other')),
  description TEXT NOT NULL,
  long_term_direction TEXT,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  extracted_from UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_identity_signals_user ON identity_signals(user_id);
CREATE INDEX idx_identity_signals_type ON identity_signals(user_id, type);
CREATE INDEX idx_identity_signals_confidence ON identity_signals(user_id, confidence DESC);

COMMENT ON TABLE identity_signals IS 'User identity aspirations and long-term direction signals extracted from conversations';
COMMENT ON COLUMN identity_signals.type IS 'Category of identity signal: founder, creator, self-discipline, leadership, other';
COMMENT ON COLUMN identity_signals.confidence IS 'Extraction confidence score (0-1), only high-confidence signals should be stored';
COMMENT ON COLUMN identity_signals.long_term_direction IS 'Where the user wants to go long-term (e.g., "entrepreneurship", "creative work")';

-- ===== Execution Patterns Table =====
-- Tracks behavioral patterns that affect execution
-- Examples: procrastination, perfectionism, burnout, scattered focus

CREATE TABLE IF NOT EXISTS execution_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL CHECK (pattern IN ('burnout', 'procrastination', 'avoidance', 'perfectionism', 'scattered_focus', 'inconsistency', 'overthinking')),
  trigger TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('rare', 'occasional', 'frequent', 'constant')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  behavioral_impact TEXT NOT NULL,
  confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  last_detected TIMESTAMPTZ DEFAULT NOW(),
  occurrences INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_execution_patterns_user ON execution_patterns(user_id);
CREATE INDEX idx_execution_patterns_pattern ON execution_patterns(user_id, pattern);
CREATE INDEX idx_execution_patterns_severity ON execution_patterns(user_id, severity);
CREATE INDEX idx_execution_patterns_frequency ON execution_patterns(user_id, frequency);

COMMENT ON TABLE execution_patterns IS 'Behavioral patterns that affect user execution, detected from conversations';
COMMENT ON COLUMN execution_patterns.pattern IS 'Type of pattern: burnout, procrastination, avoidance, perfectionism, scattered_focus, inconsistency, overthinking';
COMMENT ON COLUMN execution_patterns.trigger IS 'What triggers this pattern (e.g., "fear of failure", "overwhelm")';
COMMENT ON COLUMN execution_patterns.behavioral_impact IS 'How this pattern affects the user (e.g., "Prevents starting tasks", "Never ships products")';
COMMENT ON COLUMN execution_patterns.occurrences IS 'Number of times this pattern has been detected';

-- ===== Context Confidence Log Table =====
-- Logs context richness for each conversation to track hallucination prevention

CREATE TABLE IF NOT EXISTS context_confidence_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  richness_level TEXT NOT NULL CHECK (richness_level IN ('LOW', 'MODERATE', 'HIGH')),
  goals_count INT DEFAULT 0,
  tasks_count INT DEFAULT 0,
  commitments_count INT DEFAULT 0,
  sufficient_for_planning BOOLEAN DEFAULT FALSE,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_context_log_user ON context_confidence_log(user_id);
CREATE INDEX idx_context_log_conversation ON context_confidence_log(conversation_id);
CREATE INDEX idx_context_log_richness ON context_confidence_log(user_id, richness_level);
CREATE INDEX idx_context_log_date ON context_confidence_log(logged_at DESC);

COMMENT ON TABLE context_confidence_log IS 'Logs context confidence levels to monitor hallucination prevention effectiveness';
COMMENT ON COLUMN context_confidence_log.richness_level IS 'LOW: insufficient context, MODERATE: some context, HIGH: rich context';
COMMENT ON COLUMN context_confidence_log.sufficient_for_planning IS 'Whether there was enough context to generate plans without hallucination';

-- ===== RLS Policies =====

-- Identity Signals RLS
ALTER TABLE identity_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own identity signals"
  ON identity_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own identity signals"
  ON identity_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own identity signals"
  ON identity_signals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own identity signals"
  ON identity_signals FOR DELETE
  USING (auth.uid() = user_id);

-- Execution Patterns RLS
ALTER TABLE execution_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own execution patterns"
  ON execution_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own execution patterns"
  ON execution_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own execution patterns"
  ON execution_patterns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own execution patterns"
  ON execution_patterns FOR DELETE
  USING (auth.uid() = user_id);

-- Context Confidence Log RLS
ALTER TABLE context_confidence_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own context logs"
  ON context_confidence_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert context logs"
  ON context_confidence_log FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS anyway, but explicit for clarity

-- ===== Helper Functions =====

-- Function to get user's execution patterns summary
CREATE OR REPLACE FUNCTION get_execution_patterns_summary(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'high_severity_patterns', (
      SELECT json_agg(json_build_object(
        'pattern', pattern,
        'frequency', frequency,
        'behavioral_impact', behavioral_impact,
        'occurrences', occurrences
      ))
      FROM execution_patterns
      WHERE user_id = p_user_id
        AND severity = 'high'
        AND last_detected > NOW() - INTERVAL '30 days'
      ORDER BY occurrences DESC
      LIMIT 5
    ),
    'total_patterns_detected', (
      SELECT COUNT(*) FROM execution_patterns WHERE user_id = p_user_id
    ),
    'most_common_pattern', (
      SELECT pattern 
      FROM execution_patterns 
      WHERE user_id = p_user_id 
      ORDER BY occurrences DESC 
      LIMIT 1
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's identity signals
CREATE OR REPLACE FUNCTION get_identity_signals(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'type', type,
    'description', description,
    'long_term_direction', long_term_direction,
    'confidence', confidence,
    'created_at', created_at
  ))
  FROM identity_signals
  WHERE user_id = p_user_id
    AND confidence >= 0.75
  ORDER BY confidence DESC, created_at DESC
  INTO result;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== Update get_life_context RPC to include new data =====
-- This extends the existing get_life_context function if it exists

-- Drop and recreate to include identity signals and execution patterns
DROP FUNCTION IF EXISTS get_life_context(UUID);

CREATE OR REPLACE FUNCTION get_life_context(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'active_goals', (
      SELECT json_agg(json_build_object(
        'id', id,
        'title', title,
        'description', description,
        'category', category,
        'status', status,
        'priority', priority,
        'progress', progress,
        'targetDate', target_date,
        'createdAt', created_at
      ))
      FROM goals
      WHERE user_id = p_user_id AND status = 'active'
      ORDER BY priority DESC, created_at DESC
      LIMIT 10
    ),
    'pending_tasks', (
      SELECT json_agg(json_build_object(
        'id', id,
        'title', title,
        'description', description,
        'status', status,
        'dueDate', due_date,
        'goalId', goal_id,
        'streakCount', streak_count,
        'createdAt', created_at
      ))
      FROM tasks
      WHERE user_id = p_user_id AND status IN ('pending', 'in_progress')
      ORDER BY due_date ASC NULLS LAST
      LIMIT 15
    ),
    'active_commitments', (
      SELECT json_agg(json_build_object(
        'id', id,
        'description', description,
        'category', category,
        'status', status,
        'consistencyScore', consistency_score,
        'timesFollowedThrough', times_followed_through,
        'timesBroken', times_broken,
        'createdAt', created_at
      ))
      FROM commitments
      WHERE user_id = p_user_id AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 10
    ),
    'relationships', (
      SELECT json_agg(json_build_object(
        'id', id,
        'name', name,
        'role', role,
        'emotionalCloseness', emotional_closeness,
        'notes', notes,
        'lastMentionedAt', last_mentioned_at
      ))
      FROM relationships
      WHERE user_id = p_user_id
      ORDER BY last_mentioned_at DESC NULLS LAST
      LIMIT 10
    ),
    'todays_plan', (
      SELECT json_build_object(
        'id', id,
        'planDate', plan_date,
        'planContent', plan_content,
        'aiNotes', ai_notes,
        'completionScore', completion_score
      )
      FROM daily_plans
      WHERE user_id = p_user_id 
        AND plan_date = CURRENT_DATE
      LIMIT 1
    ),
    'identity_signals', (
      SELECT json_agg(json_build_object(
        'type', type,
        'description', description,
        'longTermDirection', long_term_direction,
        'confidence', confidence
      ))
      FROM identity_signals
      WHERE user_id = p_user_id
        AND confidence >= 0.75
      ORDER BY confidence DESC, created_at DESC
      LIMIT 5
    ),
    'execution_patterns', (
      SELECT json_agg(json_build_object(
        'pattern', pattern,
        'trigger', trigger,
        'frequency', frequency,
        'severity', severity,
        'behavioralImpact', behavioral_impact,
        'occurrences', occurrences
      ))
      FROM execution_patterns
      WHERE user_id = p_user_id
        AND last_detected > NOW() - INTERVAL '30 days'
      ORDER BY severity DESC, occurrences DESC
      LIMIT 10
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===== Grant Permissions =====

GRANT SELECT, INSERT, UPDATE, DELETE ON identity_signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON execution_patterns TO authenticated;
GRANT SELECT, INSERT ON context_confidence_log TO authenticated;

-- ===== Migration Complete =====
-- Tables: identity_signals, execution_patterns, context_confidence_log
-- Indexes: Created for efficient queries
-- RLS: Enabled with user-scoped policies
-- Functions: get_execution_patterns_summary, get_identity_signals, updated get_life_context
