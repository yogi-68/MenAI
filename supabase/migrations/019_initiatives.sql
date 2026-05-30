-- Active initiatives: specific, deadline-driven projects linked to goals
CREATE TABLE IF NOT EXISTS public.initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'paused', 'abandoned')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_initiatives_user_status
  ON public.initiatives(user_id, status);

CREATE INDEX IF NOT EXISTS idx_initiatives_target_date
  ON public.initiatives(user_id, target_date)
  WHERE status = 'active' AND target_date IS NOT NULL;

ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own initiatives" ON public.initiatives;
CREATE POLICY "Users manage own initiatives"
  ON public.initiatives FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages initiatives" ON public.initiatives;
CREATE POLICY "Service role manages initiatives"
  ON public.initiatives FOR ALL
  USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_initiatives_updated_at ON public.initiatives;
CREATE TRIGGER update_initiatives_updated_at
  BEFORE UPDATE ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.initiatives IS
  'Specific active projects with deadlines — primary input for daily plan generation';
