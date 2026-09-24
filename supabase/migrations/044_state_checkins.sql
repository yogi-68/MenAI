-- ============================================================================
-- 044 — State check-ins
--
-- The product's primary self-report instrument: one reading of mental state
-- per day, on a 1-10 scale, with optional named signals and a note.
--
-- This is what makes the coach a mental performance coach rather than a task
-- list: the daily plan is sized against capacity, and patterns are detected
-- against state over time rather than against completion rate alone.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The day this reading describes, in the user's own reckoning.
  checkin_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 1-10. See src/lib/mind/state-scale.ts for the labels.
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 10),

  -- Derived from score, stored so queries can filter without recomputing.
  band TEXT NOT NULL CHECK (band IN ('depleted', 'low', 'steady', 'strong')),

  -- Free-choice signals, e.g. {"Scattered","Tired"}. Not scored.
  signals TEXT[] NOT NULL DEFAULT '{}',

  -- Optional free text. Sensitive: treat as journal content.
  note TEXT,

  -- Which part of the day this was taken in, for time-of-day patterns.
  phase TEXT CHECK (phase IN ('morning', 'afternoon', 'evening', 'night')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One reading per day. A second submission updates the first.
  CONSTRAINT state_checkins_user_date_unique UNIQUE (user_id, checkin_date)
);

-- The two access patterns: "recent readings for this user" and "this day".
CREATE INDEX IF NOT EXISTS idx_state_checkins_user_date
  ON public.state_checkins (user_id, checkin_date DESC);

ALTER TABLE public.state_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own check-ins"
  ON public.state_checkins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users write their own check-ins"
  ON public.state_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own check-ins"
  ON public.state_checkins FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own check-ins"
  ON public.state_checkins FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.state_checkins IS
  'Daily mental-state readings. Drives plan sizing and pattern detection.';
