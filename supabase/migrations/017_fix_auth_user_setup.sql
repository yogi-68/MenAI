-- Fix auth user setup: backfill profiles, reset broken onboarding, improve signup trigger

-- Backfill profiles from auth.users
INSERT INTO public.profiles (id, full_name, avatar_url, email, onboarding_completed)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', ''),
  u.email,
  false
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = COALESCE(EXCLUDED.email, public.profiles.email),
  full_name = CASE 
    WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = '' 
    THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
  avatar_url = CASE 
    WHEN public.profiles.avatar_url IS NULL OR public.profiles.avatar_url = '' 
    THEN EXCLUDED.avatar_url ELSE public.profiles.avatar_url END;

-- Reset onboarding where auth flow was broken (profiles missing)
UPDATE public.onboarding_progress
SET 
  completed_at = NULL,
  current_question_id = 'Q1',
  completed_questions = '[]'::jsonb,
  updated_at = NOW()
WHERE completed_at IS NOT NULL;

UPDATE public.profiles SET onboarding_completed = false;

-- Signup trigger: create profile + onboarding progress
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email, onboarding_completed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    NEW.email,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.onboarding_progress (user_id, current_question_id, completed_questions, started_at)
  VALUES (NEW.id, 'Q1', '[]'::jsonb, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
