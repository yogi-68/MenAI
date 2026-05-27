# Database Column Fix - Complete Guide

## 🚨 The Problem

You're seeing this error:
```
ERROR: 42703: column "goal_id" does not exist
```

**Why it happens:** Your database tables are missing columns that your code expects to exist.

## ⚡ Quick Fix (3 minutes)

### Step 1: Open Supabase Dashboard
Go to your Supabase project → **SQL Editor**

### Step 2: Copy & Run This SQL

```sql
-- Fix tasks table
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

### Step 3: Click "Run"

✅ Done! Your error should be fixed.

## 🔍 Verify It Worked

Run this query:
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'tasks' 
  AND column_name IN ('goal_id', 'priority', 'auto_generated', 'generation_reason', 'updated_at');
```

**Expected:** 5 rows returned

## 📚 All Available Fixes

| File | Purpose | When to Use |
|------|---------|-------------|
| `QUICK_FIX.md` | Fastest solution | Just want to fix the error now |
| `supabase/migrations/011_fix_tasks_table_columns.sql` | Tasks table only | Only having issues with tasks |
| `supabase/migrations/012_fix_all_missing_columns.sql` | All tables | Want to prevent future errors |
| `COLUMN_FIX_GUIDE.md` | Detailed instructions | Need step-by-step help |
| `VERIFY_FIX.sql` | Verification script | Want to check if fix worked |
| `FIX_APPLIED_SUMMARY.md` | What was changed | Want to understand the changes |

## 🎯 Recommended: Full Fix

For best results, apply the comprehensive fix:

1. Open `supabase/migrations/012_fix_all_missing_columns.sql`
2. Copy all contents
3. Paste into Supabase SQL Editor
4. Click "Run"

This fixes:
- ✅ Tasks table (goal_id, priority, auto_generated, generation_reason, updated_at)
- ✅ Profiles table (vision, coaching_style, daily_priorities, etc.)
- ✅ Commitments table (timeframe, source, updated_at)
- ✅ Goals table (source, updated_at)
- ✅ All indexes and triggers
- ✅ All constraints and foreign keys

## 🧪 Test After Applying

### Test 1: Create Task with Goal
```sql
INSERT INTO public.tasks (user_id, goal_id, title, priority)
VALUES (
  'your-user-id-here',
  'your-goal-id-here',
  'Test Task',
  'high'
);
```

### Test 2: Generate Daily Tasks
```sql
SELECT generate_daily_tasks('your-user-id-here'::uuid);
```

### Test 3: Query Tasks by Goal
```sql
SELECT * FROM tasks WHERE goal_id = 'your-goal-id-here';
```

All three should work without errors.

## 🔧 Alternative: Supabase CLI

If you prefer using the CLI:

```bash
cd c:\Users\yoges\OneDrive\Desktop\MentalAI

# Apply all pending migrations
supabase migration up

# Or push all migrations
supabase db push
```

## ❓ Common Questions

### Q: Is this safe to run?
**A:** Yes! Uses `ADD COLUMN IF NOT EXISTS`, won't affect existing data.

### Q: Can I run it multiple times?
**A:** Yes! Safe to run repeatedly.

### Q: Will it delete my data?
**A:** No! Only adds columns, never removes anything.

### Q: What if I already have some columns?
**A:** No problem! `IF NOT EXISTS` will skip columns that already exist.

### Q: Do I need to restart my app?
**A:** No, changes are immediate. Just refresh your app.

## 🐛 Troubleshooting

### Error: "permission denied"
**Fix:** Make sure you're logged into Supabase with proper permissions. Use the Dashboard SQL Editor with your project admin account.

### Error: "function update_updated_at() does not exist"
**Fix:** Run migration 012 which creates this function, or copy the function definition from the Quick Fix above.

### Error: "relation tasks does not exist"
**Fix:** You need to run the base schema first. Run `supabase/schema.sql` then `supabase/migration_life_os.sql`, then apply this fix.

### Still getting "column does not exist"
**Fix:** 
1. Run `VERIFY_FIX.sql` to see which columns are missing
2. Check the query results
3. Apply the comprehensive fix (migration 012)
4. Run `VERIFY_FIX.sql` again to confirm

## 📖 Understanding What Changed

### Before Fix
```typescript
// This would fail ❌
const { data } = await supabase
  .from('tasks')
  .insert({ goal_id: '...', priority: 'high' })
```

### After Fix
```typescript
// This works ✅
const { data } = await supabase
  .from('tasks')
  .insert({ goal_id: '...', priority: 'high' })
```

## 🎉 Success Indicators

After applying the fix, you should see:
- ✅ No more "column does not exist" errors
- ✅ Tasks can be linked to goals
- ✅ Daily task generation works
- ✅ Task priority filtering works
- ✅ Auto-generated tasks are trackable
- ✅ Profile onboarding data saves correctly

## 📞 Need More Help?

1. **Quick Reference:** See `QUICK_FIX.md`
2. **Detailed Guide:** See `COLUMN_FIX_GUIDE.md`
3. **Verification:** Run `VERIFY_FIX.sql`
4. **What Changed:** See `FIX_APPLIED_SUMMARY.md`
5. **Check Supabase Logs:** Dashboard → Logs → Database Logs

## ⏭️ Next Steps After Fix

1. Test task creation in your app
2. Test goal-task linking
3. Try the daily task generation feature
4. Complete user onboarding flow
5. Verify all dashboard features work

## 📝 Notes

- These fixes are part of your migration history
- They align your database with your TypeScript types
- They enable features like auto-task generation
- They're required for the onboarding flow to work properly
- They fix the mismatch between schema versions

---

**Last Updated:** May 27, 2026  
**Status:** Ready to apply  
**Estimated Time:** 3-5 minutes
