-- Success criteria for initiatives (onboarding Q7 + planning context)
ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS success_criteria TEXT;

COMMENT ON COLUMN public.initiatives.success_criteria IS
  'Concrete success definition for this initiative — drives plan quality and reviews';
