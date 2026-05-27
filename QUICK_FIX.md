# Quick Fix for "goal_id does not exist" Error

## Fastest Fix (Copy & Paste)

1. Open your **Supabase Dashboard** → **SQL Editor**
2. Copy this SQL and click **Run**:

```sql
-- Quick fix for missing columns in tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON public.tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_gen ON public.tasks(user_id, auto_generated, due_date) WHERE auto_generated = true;

-- Create trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at 
  BEFORE UPDATE ON public.tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

3. ✅ Done! Your error should be fixed.

## Verify It Worked

Run this query to check the columns exist:

```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'tasks' 
  AND column_name IN ('goal_id', 'priority', 'auto_generated', 'generation_reason', 'updated_at');
```

You should see 5 rows returned.

## Complete Fix (All Tables)

If you want to fix **all tables** and prevent future errors, run migration 012 instead:

1. Open `supabase/migrations/012_fix_all_missing_columns.sql`
2. Copy all contents
3. Paste into Supabase SQL Editor
4. Click **Run**

## Need More Help?

See `COLUMN_FIX_GUIDE.md` for detailed instructions and troubleshooting.

## Using Supabase CLI?

```bash
cd c:\Users\yoges\OneDrive\Desktop\MentalAI
supabase migration up
```

Or push specific migration:

```bash
supabase db push --include-migrations 011,012
```
