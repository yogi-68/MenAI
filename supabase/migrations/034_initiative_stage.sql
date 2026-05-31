-- Business/build initiative stage — drives milestone generation (no hallucinated workshops)
ALTER TABLE public.initiatives
  ADD COLUMN IF NOT EXISTS initiative_stage TEXT
  CHECK (
    initiative_stage IS NULL
    OR initiative_stage IN ('exploring', 'first_client', 'has_clients', 'scaling')
  );

COMMENT ON COLUMN public.initiatives.initiative_stage IS
  'Execution stage for domain-specific milestones — set at onboarding or initiative creation';
