-- AI usage logs are admin/service only — users must not read or write them

DROP POLICY IF EXISTS "Users read own ai usage" ON public.ai_usage_log;
DROP POLICY IF EXISTS "Users insert own ai usage" ON public.ai_usage_log;

DROP POLICY IF EXISTS "Admins read all ai usage" ON public.ai_usage_log;
CREATE POLICY "Admins read all ai usage"
  ON public.ai_usage_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
