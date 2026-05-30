-- Initiative milestones + current focus (one active focus at a time)

CREATE TABLE IF NOT EXISTS public.initiative_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id UUID NOT NULL REFERENCES public.initiatives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_initiative
  ON public.initiative_milestones(initiative_id, sort_order);

ALTER TABLE public.initiative_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own milestones" ON public.initiative_milestones;
CREATE POLICY "Users manage own milestones"
  ON public.initiative_milestones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages milestones" ON public.initiative_milestones;
CREATE POLICY "Service role manages milestones"
  ON public.initiative_milestones FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_focus_initiative_id UUID REFERENCES public.initiatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_focus_until DATE;

COMMENT ON COLUMN public.profiles.current_focus_initiative_id IS
  'Single active focus initiative — daily plans prioritize this over others.';
