-- Migration: Add relationships table for extraction engine
-- This table tracks people mentioned in conversations

-- Create relationships table
CREATE TABLE IF NOT EXISTS public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('partner', 'parent', 'friend', 'mentor', 'coworker', 'other')),
  notes text,
  last_mentioned_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_relationships_user_id ON public.relationships(user_id);

-- Enable RLS
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- Create policy for user access
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'relationships' 
    AND policyname = 'relationships_policy'
  ) THEN
    CREATE POLICY relationships_policy ON public.relationships
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS relationships_updated_at ON public.relationships;
CREATE TRIGGER relationships_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_relationships_updated_at();
