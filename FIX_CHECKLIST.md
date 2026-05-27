# Database Column Fix Checklist

Use this checklist to track your progress applying the fix.

## Pre-Fix Checklist

- [ ] I have access to my Supabase Dashboard
- [ ] I can open the SQL Editor in Supabase
- [ ] I've backed up my database (optional but recommended)
- [ ] I've read the `README_COLUMN_FIX.md` or `QUICK_FIX.md`

## Apply the Fix

Choose ONE method:

### Option A: Quick Fix (Recommended for immediate fix)
- [ ] Opened `QUICK_FIX.md`
- [ ] Copied the SQL code
- [ ] Pasted into Supabase SQL Editor
- [ ] Clicked "Run"
- [ ] Saw success message (no errors)

### Option B: Comprehensive Fix (Recommended for long-term)
- [ ] Opened `supabase/migrations/012_fix_all_missing_columns.sql`
- [ ] Copied all contents
- [ ] Pasted into Supabase SQL Editor
- [ ] Clicked "Run"
- [ ] Saw success message (no errors)

### Option C: CLI Method
- [ ] Navigated to project directory in terminal
- [ ] Ran `supabase migration up`
- [ ] Saw migrations applied successfully

## Verify the Fix

- [ ] Ran the verification query from `QUICK_FIX.md`
- [ ] Got 5 rows returned (all columns exist)
- [ ] No error messages in Supabase logs

**Verification Query:**
```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'tasks' 
  AND column_name IN ('goal_id', 'priority', 'auto_generated', 'generation_reason', 'updated_at');
```

## Test the Fix

- [ ] Tested creating a task through the app
- [ ] Tested linking a task to a goal
- [ ] Tested task filtering by priority
- [ ] No "column does not exist" errors appear

## Optional: Full Verification

- [ ] Ran `VERIFY_FIX.sql` in SQL Editor
- [ ] All queries returned expected row counts
- [ ] All indexes exist
- [ ] All triggers exist
- [ ] Foreign key constraint exists

## Cleanup & Documentation

- [ ] Updated project documentation with fix applied
- [ ] Noted the date the fix was applied
- [ ] Committed changes to git (if using version control)
- [ ] Informed team members (if working in a team)

## After Fix

- [ ] App is working without column errors
- [ ] Daily task generation works
- [ ] Onboarding saves data correctly
- [ ] Dashboard displays data properly
- [ ] All features functioning as expected

## If Something Goes Wrong

If you encounter errors:

1. Check which option you used:
   - [ ] Quick Fix → Try Comprehensive Fix instead
   - [ ] Comprehensive Fix → Check Supabase logs for error details
   - [ ] CLI → Try Dashboard method instead

2. Common issues:
   - [ ] Permission denied → Make sure you're project admin
   - [ ] Function doesn't exist → Run comprehensive fix (012)
   - [ ] Table doesn't exist → Run base schema first
   - [ ] Still getting errors → Run `VERIFY_FIX.sql` to diagnose

3. Get help:
   - [ ] Read `COLUMN_FIX_GUIDE.md` for detailed troubleshooting
   - [ ] Check Supabase Dashboard → Logs
   - [ ] Review error message and search in fix documentation

## Status

**Current Status:** 🔴 Not Started

After completing checklist:
- 🟢 Fix Applied Successfully
- 🟡 Fix Applied, Minor Issues
- 🔴 Fix Failed, Need Help

**Date Applied:** _____________

**Applied By:** _____________

**Method Used:** _____________
- [ ] Quick Fix (Option A)
- [ ] Comprehensive Fix (Option B)  
- [ ] CLI (Option C)

**Notes:**
```
[Add any notes about the fix process here]
```

---

## Quick Reference

| If you need... | See this file... |
|----------------|------------------|
| Fastest solution | `QUICK_FIX.md` |
| Complete guide | `README_COLUMN_FIX.md` |
| Detailed steps | `COLUMN_FIX_GUIDE.md` |
| What changed | `FIX_APPLIED_SUMMARY.md` |
| Verification script | `VERIFY_FIX.sql` |
| This checklist | `FIX_CHECKLIST.md` |

---

**Estimated Time:** 5 minutes  
**Difficulty:** Easy  
**Risk Level:** Low (safe to apply)
