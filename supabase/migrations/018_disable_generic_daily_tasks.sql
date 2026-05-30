-- Daily plans are AI-generated via /api/plans/generate when user opens Today's Plan.
-- Disable legacy generic task SQL to avoid vague duplicates.

CREATE OR REPLACE FUNCTION public.generate_daily_tasks(p_user_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;
