-- Migration 042: Goal progress snapshots for analytics charts
CREATE TABLE IF NOT EXISTS goal_progress_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  progress_pct numeric(5,2) DEFAULT 0,
  tasks_completed_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (goal_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshots_user
  ON goal_progress_snapshots(user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_goal_progress_snapshots_goal
  ON goal_progress_snapshots(goal_id, snapshot_date DESC);

ALTER TABLE goal_progress_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS goal_progress_snapshots_select ON goal_progress_snapshots;
CREATE POLICY goal_progress_snapshots_select ON goal_progress_snapshots
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS goal_progress_snapshots_insert ON goal_progress_snapshots;
CREATE POLICY goal_progress_snapshots_insert ON goal_progress_snapshots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE goal_progress_snapshots IS 'Daily goal progress snapshots written by nightly synthesis cron';
