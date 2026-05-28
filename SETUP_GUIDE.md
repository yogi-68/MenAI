# MenAI Database & Feature Setup Guide

This guide will help you properly set up the database schema, automatic task generation, and ensure all features work correctly.

## 🚀 Quick Setup (Do These Steps in Order)

### 1. Run Database Migrations

Go to your Supabase Dashboard → SQL Editor and run these files **in order**:

1. **`supabase/schema.sql`** - Base schema (if not already run)
2. **`supabase/migrations/010_consolidated_schema.sql`** - ⭐ **RUN THIS** - Consolidated schema with all features

The consolidated migration will:
- Add missing profile columns (vision, work_style, daily_priorities, etc.)
- Create proper goals, tasks, commitments tables
- Set up onboarding_responses and onboarding_progress tables
- Create identity_signals and execution_patterns tables
- Add automatic task generation function
- Set up proper RLS policies

### 2. Deploy Edge Function for Automatic Task Generation

```bash
# Login to Supabase CLI
npx supabase login

# Link to your project
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
npx supabase functions deploy generate-daily-tasks
```

### 3. Set Up Daily Cron Job

In Supabase Dashboard → Database → Extensions, enable:
- `pg_net` extension
- `pg_cron` extension

Then run this SQL to set up the cron job:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create daily task generation job (runs at 6 AM UTC)
SELECT cron.schedule(
  'daily-task-generation',
  '0 6 * * *',  -- Every day at 6 AM UTC
  $$
  SELECT
    net.http_post(
      url:='https://zshgaiqapgesppcvfnwz.supabase.co/functions/v1/generate-daily-tasks',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaGdhaXFhcGdlc3BwY3Zmbnd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0NjAyNCwiZXhwIjoyMDk0NTIyMDI0fQ.LfCsKBT_6HyCLtOxmNZ11OE2Cj1Mi43nR5O00-QtduA"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);

-- Check if cron job is set up
SELECT * FROM cron.job;
```

**Replace**:
- `YOUR_PROJECT_REF` with your Supabase project reference
- `YOUR_SERVICE_ROLE_KEY` with your service role key (found in Project Settings → API)

### 4. Verify Profile Trigger

Check that the profile auto-creation trigger exists:

```sql
-- Should return the trigger function
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';

-- Should return the trigger
SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

If they don't exist, run this:

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## ✅ Testing the Setup

### Test 1: Profile Creation

1. Sign up a new test user
2. Check that profile was created:

```sql
SELECT id, full_name, onboarding_completed, created_at 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 1;
```

### Test 2: Onboarding Flow

1. Complete the onboarding questions
2. Check responses are saved:

```sql
SELECT user_id, question_id, processed 
FROM onboarding_responses 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at;
```

3. Check extraction worked:

```sql
-- Check goals
SELECT * FROM goals WHERE user_id = 'YOUR_USER_ID';

-- Check commitments
SELECT * FROM commitments WHERE user_id = 'YOUR_USER_ID';

-- Check patterns
SELECT * FROM execution_patterns WHERE user_id = 'YOUR_USER_ID';

-- Check profile updates
SELECT 
  support_style, 
  daily_priorities, 
  lifestyle_issues, 
  reflection_frequency 
FROM profiles 
WHERE id = 'YOUR_USER_ID';
```

### Test 3: Manual Task Generation

Test the task generation function manually:

```sql
-- Generate tasks for a specific user
SELECT generate_daily_tasks('YOUR_USER_ID');

-- Check tasks were created
SELECT 
  id, title, status, due_date, 
  auto_generated, generation_reason 
FROM tasks 
WHERE user_id = 'YOUR_USER_ID' 
AND due_date = CURRENT_DATE;

-- Check generation log
SELECT * FROM task_generation_log 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC;
```

### Test 4: Edge Function (Manual Trigger)

```bash
curl -X POST https://zshgaiqapgesppcvfnwz.supabase.co/functions/v1/generate-daily-tasks \
  -H "Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzaGdhaXFhcGdlc3BwY3Zmbnd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk0NjAyNCwiZXhwIjoyMDk0NTIyMDI0fQ.LfCsKBT_6HyCLtOxmNZ11OE2Cj1Mi43nR5O00-QtduA"
```

Should return:

```json
{
  "success": true,
  "totalUsers": 1,
  "usersProcessed": 1,
  "totalTasksGenerated": 3,
  "timestamp": "2026-05-27T12:00:00.000Z"
}
```

---

## 🔧 How It Works

### Signup & Onboarding Flow

1. **User signs up** → `auth.users` row created
2. **Trigger fires** → `profiles` row auto-created via `handle_new_user()`
3. **Auth callback** → Redirects to `/onboarding` (checks `onboarding_completed`)
4. **User answers questions** → Saved to `onboarding_responses`
5. **Extraction runs** → AI extracts goals, commitments, patterns
6. **Completion** → Sets `profiles.onboarding_completed = true`
7. **Redirect** → User sent to `/dashboard`

### Daily Task Generation

1. **Cron job triggers** at 6 AM UTC daily
2. **Edge function** fetches all users with `onboarding_completed = true`
3. **For each user**:
   - Calls `generate_daily_tasks(user_id, today)`
   - Function checks if tasks already generated today (prevents duplicates)
   - Fetches top 3 active goals (sorted by priority)
   - Creates 1 task per goal with `auto_generated = true`
   - Logs to `task_generation_log`
4. **Users see tasks** in their dashboard for the day

### AI Memory & Context

When user chats with AI:
- System calls `get_user_context(user_id)` function
- Returns: goals, tasks, commitments, execution patterns, profile data
- AI uses this context to provide personalized guidance

---

## 📊 Monitoring & Debugging

### Check Daily Task Generation Status

```sql
-- Today's generation stats
SELECT 
  COUNT(DISTINCT user_id) as users_processed,
  SUM(tasks_generated) as total_tasks,
  STRING_AGG(status, ', ') as statuses
FROM task_generation_log 
WHERE generation_date = CURRENT_DATE;

-- Failed generations
SELECT user_id, error_message, created_at 
FROM task_generation_log 
WHERE status = 'failed' 
AND generation_date = CURRENT_DATE;
```

### Check User Data Completeness

```sql
-- Users without goals (onboarding may have failed)
SELECT p.id, p.full_name, p.onboarding_completed, COUNT(g.id) as goal_count
FROM profiles p
LEFT JOIN goals g ON g.user_id = p.id
WHERE p.onboarding_completed = true
GROUP BY p.id, p.full_name, p.onboarding_completed
HAVING COUNT(g.id) = 0;
```

### Check Cron Job Status

```sql
-- List all cron jobs
SELECT jobid, jobname, schedule, active, database 
FROM cron.job;

-- Check cron job run history
SELECT jobid, runid, job_pid, status, return_message, start_time, end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-task-generation')
ORDER BY start_time DESC
LIMIT 10;
```

---

## 🐛 Troubleshooting

### Issue: Profile not created on signup

**Check**:
```sql
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
```

**Fix**: Re-run the profile trigger creation SQL from Step 4 above.

### Issue: Onboarding extraction not working

**Check**:
1. OpenAI API key is set in `.env.local`
2. Check API route logs: `npm run dev` and watch console
3. Check `onboarding_responses.processed` is being set to `true`

**Fix**: Ensure `OPENAI_API_KEY` is set and extraction logic runs (check server logs).

### Issue: Daily tasks not generating

**Check**:
1. Cron job exists: `SELECT * FROM cron.job;`
2. Edge function deployed: Check Supabase Dashboard → Edge Functions
3. Function logs: Dashboard → Edge Functions → generate-daily-tasks → Logs

**Fix**: 
- Redeploy edge function
- Re-create cron job
- Test manually first

### Issue: HTTP 406 errors on profile fetch

**Already fixed** in the recent updates:
- Added explicit `Accept: application/json` headers to Supabase clients
- Check `.env.local` has correct `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## 🎯 Feature Checklist

After setup, verify these features work:

- [ ] New user signup creates profile automatically
- [ ] Signup/login redirects to onboarding if not completed
- [ ] All 10 onboarding questions can be answered
- [ ] Onboarding extraction creates goals, commitments, patterns
- [ ] Onboarding completion redirects to dashboard
- [ ] Dashboard shows user's goals and tasks
- [ ] Daily tasks auto-generate for all users
- [ ] AI chat uses user context (goals, patterns, etc.)
- [ ] Light theme is default, dark theme toggle works
- [ ] Landing page shows new universal messaging

---

## 📝 Next Steps

After verifying everything works:

1. **Monitor for a few days** - Check task generation logs daily
2. **Adjust task generation** - Modify `generate_daily_tasks()` function if needed
3. **Improve AI extraction** - Fine-tune confidence thresholds in `onboarding-extraction.ts`
4. **Add more automation** - Consider weekly goal reviews, progress reports, etc.

---

## 🆘 Getting Help

If you encounter issues:

1. Check Supabase logs (Dashboard → Logs)
2. Check Edge Function logs (Dashboard → Edge Functions → Logs)
3. Check browser console for frontend errors
4. Check server console (`npm run dev`) for API errors
5. Review the SQL error messages carefully

**Common SQL Fix**: If you see constraint violations or "already exists" errors, the migrations may have run partially. You can safely re-run the consolidated migration - it uses `IF NOT EXISTS` clauses.
