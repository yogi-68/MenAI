-- Behavioral Observations Table
-- Foundation for longitudinal intelligence tracking
-- Tracks patterns that emerge over time for premium intelligence

CREATE TABLE IF NOT EXISTS public.behavioral_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  observation_type text NOT NULL CHECK (observation_type IN (
    'execution_pattern',
    'direction_shift',
    'emotional_trend',
    'identity_evolution',
    'momentum_pattern',
    'commitment_pattern'
  )),
  observation text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  confidence real NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_behavioral_observations_user_id ON public.behavioral_observations(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_observations_type ON public.behavioral_observations(observation_type);
CREATE INDEX IF NOT EXISTS idx_behavioral_observations_confidence ON public.behavioral_observations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_observations_last_seen ON public.behavioral_observations(last_seen DESC);

-- RLS Policies
ALTER TABLE public.behavioral_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own behavioral observations"
  ON public.behavioral_observations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert behavioral observations"
  ON public.behavioral_observations
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update behavioral observations"
  ON public.behavioral_observations
  FOR UPDATE
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_behavioral_observations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_behavioral_observations_updated_at
  BEFORE UPDATE ON public.behavioral_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_behavioral_observations_updated_at();

-- Comments
COMMENT ON TABLE public.behavioral_observations IS 'Tracks recurring behavioral patterns over time for longitudinal intelligence';
COMMENT ON COLUMN public.behavioral_observations.observation_type IS 'Category of pattern being observed';
COMMENT ON COLUMN public.behavioral_observations.occurrence_count IS 'Number of times this pattern has been observed';
COMMENT ON COLUMN public.behavioral_observations.confidence IS 'Confidence score 0-1 for this observation';
COMMENT ON COLUMN public.behavioral_observations.first_seen IS 'When this pattern was first detected';
COMMENT ON COLUMN public.behavioral_observations.last_seen IS 'Most recent occurrence of this pattern';
