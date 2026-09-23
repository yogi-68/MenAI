-- ============================================================================
-- 043 — RLS hardening, account deletion, and missing indexes
--
-- Closes three classes of problem found in an audit of migrations 003–042:
--   1. A table in the public schema with RLS never enabled.
--   2. Policies written as USING (true) / WITH CHECK (true), which grant every
--      authenticated user the access they were meant to grant the service role.
--   3. No way for a user to delete their own account.
--
-- Forward-only. No existing migration file is edited.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. user_deletion_log had no RLS at all
--
-- Created in 015 and never protected. With RLS off on a public-schema table,
-- any client holding the anon key can read every row through PostgREST. The
-- rows contain deleted user ids and per-table record counts.
-- ----------------------------------------------------------------------------

ALTER TABLE public.user_deletion_log ENABLE ROW LEVEL SECURITY;

-- Written by a SECURITY DEFINER trigger, which bypasses RLS. Nothing else
-- should be able to read or write it, so no permissive policy is added:
-- with RLS enabled and no policy, non-service-role access is denied.
DROP POLICY IF EXISTS "Service role manages deletion log" ON public.user_deletion_log;
CREATE POLICY "Service role manages deletion log"
  ON public.user_deletion_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ----------------------------------------------------------------------------
-- 2. Replace the permissive `true` policies from the two 004 migrations
--
-- Their comments say "service role bypasses RLS anyway, but explicit for
-- clarity" — but because they never test auth.role(), they grant INSERT and
-- UPDATE on these tables to any signed-in user. Later migrations (010, 019+)
-- use the correct form; these were never cleaned up.
-- ----------------------------------------------------------------------------

-- behavioral_predictions
DROP POLICY IF EXISTS "Service role can insert predictions" ON public.behavioral_predictions;
CREATE POLICY "Service role can insert predictions"
  ON public.behavioral_predictions
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can update predictions" ON public.behavioral_predictions;
CREATE POLICY "Service role can update predictions"
  ON public.behavioral_predictions
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- behavioral_reports
DROP POLICY IF EXISTS "Service role can insert reports" ON public.behavioral_reports;
CREATE POLICY "Service role can insert reports"
  ON public.behavioral_reports
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- behavioral_observations
DROP POLICY IF EXISTS "System can insert behavioral observations" ON public.behavioral_observations;
CREATE POLICY "System can insert behavioral observations"
  ON public.behavioral_observations
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "System can update behavioral observations" ON public.behavioral_observations;
CREATE POLICY "System can update behavioral observations"
  ON public.behavioral_observations
  FOR UPDATE
  USING (auth.role() = 'service_role');

-- context_confidence_log
DROP POLICY IF EXISTS "Service role can insert context logs" ON public.context_confidence_log;
CREATE POLICY "Service role can insert context logs"
  ON public.context_confidence_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');


-- ----------------------------------------------------------------------------
-- 3. Account deletion
--
-- profiles had SELECT / UPDATE / INSERT policies only, so a user could not
-- remove their own data. Every domain table already references
-- auth.users(id) ON DELETE CASCADE, so deleting the auth user is sufficient;
-- this function exists so the app can trigger that safely and atomically.
--
-- For a product holding reflections, chat transcripts and crisis events, a
-- working delete path is a legal requirement (GDPR art. 17, DPDP s.12), not a
-- convenience.
-- ----------------------------------------------------------------------------

CREATE POLICY "Users can delete their own profile"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.delete_current_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  -- The BEFORE DELETE trigger on profiles (migration 015) records counts into
  -- user_deletion_log; cascades from auth.users remove the rest.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_current_user() TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Missing index
--
-- memories is queried as (user_id, created_at DESC) by the memory snapshot API
-- and the memory engine, but only had an index on conversation_id.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_memories_user_created
  ON public.memories (user_id, created_at DESC);
