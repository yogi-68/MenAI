-- Daily reflections, weekly reviews, plan engagement tracking

-- ================================================================
-- DAILY REFLECTIONS: structured end-of-day signals
-- ================================================================
CREATE TABLE IF NOT EXISTS public.daily_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  reflection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  moved_forward TEXT NOT NULL,
  blocked_by TEXT NOT NULL,
  tomorrow_context TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, reflection_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reflections_user_date
  ON public.daily_reflections(user_id, reflection_date DESC);

ALTER TABLE public.daily_reflections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reflections" ON public.daily_reflections;
CREATE POLICY "Users manage own reflections"
  ON public.daily_reflections FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages reflections" ON public.daily_reflections;
CREATE POLICY "Service role manages reflections"
  ON public.daily_reflections FOR ALL
  USING (auth.role() = 'service_role');

-- ================================================================
-- WEEKLY REVIEWS: AI-generated strategic guidance
-- ================================================================
CREATE TABLE IF NOT EXISTS public.weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user
  ON public.weekly_reviews(user_id, week_start DESC);

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own weekly reviews" ON public.weekly_reviews;
CREATE POLICY "Users manage own weekly reviews"
  ON public.weekly_reviews FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages weekly reviews" ON public.weekly_reviews;
CREATE POLICY "Service role manages weekly reviews"
  ON public.weekly_reviews FOR ALL
  USING (auth.role() = 'service_role');

-- ================================================================
-- PLAN ENGAGEMENT: track return-after-plan for SaaS metric
-- ================================================================
CREATE TABLE IF NOT EXISTS public.plan_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  plan_generated_at TIMESTAMPTZ DEFAULT NOW(),
  returned_next_day BOOLEAN DEFAULT false,
  returned_at TIMESTAMPTZ,
  UNIQUE (user_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_plan_engagement_user
  ON public.plan_engagement(user_id, plan_date DESC);

ALTER TABLE public.plan_engagement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own plan engagement" ON public.plan_engagement;
CREATE POLICY "Users manage own plan engagement"
  ON public.plan_engagement FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages plan engagement" ON public.plan_engagement;
CREATE POLICY "Service role manages plan engagement"
  ON public.plan_engagement FOR ALL
  USING (auth.role() = 'service_role');

-- Drop orphaned legacy report table (replaced by weekly_reviews)
DROP TABLE IF EXISTS public.behavioral_reports CASCADE;

COMMENT ON TABLE public.daily_reflections IS
  'End-of-day structured signals — context metrics cannot capture';
COMMENT ON TABLE public.weekly_reviews IS
  'AI-generated weekly strategic review';
COMMENT ON TABLE public.plan_engagement IS
  'Tracks 7-day return rate after plan generation';
