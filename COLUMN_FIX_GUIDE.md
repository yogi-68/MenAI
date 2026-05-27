# Fix for Missing Column Errors

## Problem
You're encountering errors like:
```
ERROR: 42703: column "goal_id" does not exist
ERROR: 42703: column "priority" does not exist
ERROR: 42703: column "auto_generated" does not exist
```

This happens when tables were created from earlier migrations that didn't include all the necessary columns.

## Solution - Two Options

### Comprehensive Fix (Recommended)
Use migration `012_fix_all_missing_columns.sql` - this fixes ALL tables at once.

### Targeted Fix
Use migration `011_fix_tasks_table_columns.sql` - this only fixes the tasks table.

## Application Instructions

### Option 1: Apply Migration via Supabase Dashboard (Recommended)

**For Comprehensive Fix:**
1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/012_fix_all_missing_columns.sql`
4. Paste it into the SQL Editor
5. Click **Run** to execute the migration

**For Tasks-Only Fix:**
1. Open your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/011_fix_tasks_table_columns.sql`
4. Paste it into the SQL Editor
5. Click **Run** to execute the migration

### Option 2: Apply Migration via Supabase CLI

If you have the Supabase CLI installed:

```bash
# Navigate to your project directory
cd c:\Users\yoges\OneDrive\Desktop\MentalAI

# Push the new migration to your database
supabase db push

# Or apply a specific migration
supabase migration up
```

### Option 3: Manual SQL Execution

If neither option above works, you can manually run this SQL in your Supabase SQL Editor:

```sql
-- Add missing columns to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;

ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));

ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS generation_reason TEXT;

ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON public.tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_gen ON public.tasks(user_id, auto_generated, due_date) WHERE auto_generated = true;
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_date ON public.tasks(user_id, status, due_date);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at 
  BEFORE UPDATE ON public.tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Verification

After applying the fix, verify that the columns exist:

```sql
-- Check if columns were added successfully
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tasks'
ORDER BY ordinal_position;
```

You should see these columns in the output:
- `goal_id` (uuid, nullable)
- `priority` (text, not null)
- `auto_generated` (boolean, not null)
- `generation_reason` (text, nullable)
- `updated_at` (timestamp with time zone, not null)

## Testing

After applying the fix, test the functionality:

1. **Test Task Creation with Goal**:
```sql
-- This should now work without errors
INSERT INTO public.tasks (user_id, goal_id, title, priority, auto_generated)
VALUES (
  'your-user-id',
  'your-goal-id',
  'Test Task',
  'high',
  false
);
```

2. **Test the RPC Function**:
```sql
-- Test daily task generation
SELECT generate_daily_tasks('your-user-id'::uuid);
```

3. **Test via API**:
- Try creating a task through your application
- Try fetching tasks filtered by goal_id
- Try generating daily tasks

## What This Fix Does

### Comprehensive Fix (Migration 012)

Fixes **all tables** with missing columns:

**Tasks Table:**
- `goal_id`: Links tasks to goals (optional reference)
- `priority`: Task priority (low, medium, high)
- `auto_generated`: Flags tasks created automatically by the system
- `generation_reason`: Explains why a task was auto-generated
- `updated_at`: Timestamp that auto-updates when task is modified

**Profiles Table:**
- `vision`: User's long-term vision
- `founder_mode`: Whether user operates in founder mode
- `coaching_style`: AI interaction preference
- `lifestyle_issues`: Array of lifestyle challenges
- `stress_response`: How user responds to stress
- `work_style`: User's work approach
- `daily_priorities`: User's focus areas
- `support_style`: Preferred guidance style
- `reflection_frequency`: How often user reflects

**Commitments Table:**
- `timeframe`: When commitment should be achieved
- `source`: Where commitment came from
- `updated_at`: Last update timestamp

**Goals Table:**
- `source`: Where goal came from
- `updated_at`: Last update timestamp

**Also Creates:**
- All necessary indexes for query performance
- Triggers to auto-update `updated_at` timestamps
- Proper foreign key constraints
- Check constraints for enums

### Targeted Fix (Migration 011)

Only fixes the `tasks` table columns listed above.

## Additional Notes

- This migration is safe to run multiple times (uses `IF NOT EXISTS`)
- Existing data will not be affected
- New columns have default values, so existing rows will be populated automatically
- The fix is backward compatible with your existing code

## Which Migration Should I Use?

- **Use Migration 012** (Comprehensive): If you want to fix everything at once and prevent future column errors
- **Use Migration 011** (Targeted): If you only have issues with the tasks table and want a minimal fix

Both are safe to run and won't affect existing data.

## Related Files

- **Comprehensive fix**: `supabase/migrations/012_fix_all_missing_columns.sql`
- **Tasks-only fix**: `supabase/migrations/011_fix_tasks_table_columns.sql`
- Consolidated schema: `supabase/migrations/010_consolidated_schema.sql`
- Base schema: `supabase/schema.sql`
- Life OS migration: `supabase/migration_life_os.sql`
