-- Product funnel analytics (admin-only reads; server-side writes)

CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_name_date
  ON public.product_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_date
  ON public.product_events(user_id, created_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages product events" ON public.product_events;
CREATE POLICY "Service role manages product events"
  ON public.product_events FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins read product events" ON public.product_events;
CREATE POLICY "Admins read product events"
  ON public.product_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
