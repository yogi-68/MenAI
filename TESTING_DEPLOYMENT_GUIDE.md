# MentalAI - Testing & Deployment Guide

## 🧪 Testing Checklist

### 1. Database Migration Testing

```bash
# Navigate to project directory
cd c:\Users\yoges\OneDrive\Desktop\MentalAI

# Reset local database with all migrations
npx supabase db reset --local

# Verify migrations applied
npx supabase db diff --local

# Check for any schema issues
npx supabase db lint --local
```

**Expected Result**: All migrations apply cleanly without errors

### 2. Test User Registration & Email Storage

```sql
-- After registering a new user, check email is stored
SELECT id, full_name, email, onboarding_completed, created_at 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 1;
```

**Expected Result**: Email field is populated with the registration email

### 3. Test Identity Signals Column

```sql
-- This query should work without errors (uses 'type' not 'signal_type')
SELECT type, description, confidence 
FROM identity_signals 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY confidence DESC 
LIMIT 5;
```

**Expected Result**: No 400 error, returns identity signals data

### 4. Test Task Generation

```sql
-- Generate tasks for a user
SELECT generate_daily_tasks('YOUR_USER_ID', CURRENT_DATE);

-- Check generated tasks
SELECT 
  id, 
  title, 
  description, 
  estimated_minutes,
  auto_generated,
  generation_reason
FROM tasks 
WHERE user_id = 'YOUR_USER_ID' 
AND due_date = CURRENT_DATE 
AND auto_generated = true;
```

**Expected Result**: 
- Function returns number of tasks created (0-3)
- Tasks have specific, actionable titles (not "Progress on: [goal]")
- Tasks include descriptions explaining what to do
- estimated_minutes defaults to 60

### 5. Test Cascade Deletes

```sql
-- Count user data before deletion
SELECT 
  (SELECT COUNT(*) FROM goals WHERE user_id = 'TEST_USER_ID') as goals,
  (SELECT COUNT(*) FROM tasks WHERE user_id = 'TEST_USER_ID') as tasks,
  (SELECT COUNT(*) FROM conversations WHERE user_id = 'TEST_USER_ID') as conversations,
  (SELECT COUNT(*) FROM messages WHERE user_id = 'TEST_USER_ID') as messages,
  (SELECT COUNT(*) FROM memories WHERE user_id = 'TEST_USER_ID') as memories;

-- Delete test user
DELETE FROM auth.users WHERE id = 'TEST_USER_ID';

-- Check deletion log
SELECT * FROM user_deletion_log 
WHERE deleted_user_id = 'TEST_USER_ID';

-- Verify all data deleted
SELECT COUNT(*) FROM goals WHERE user_id = 'TEST_USER_ID'; -- Should be 0
SELECT COUNT(*) FROM tasks WHERE user_id = 'TEST_USER_ID'; -- Should be 0
```

**Expected Result**: All user data deleted, logged in user_deletion_log

### 6. Test Conversation-Specific Deletion

```bash
# Via API
curl -X DELETE http://localhost:3000/api/conversations/CONVERSATION_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Result**:
```json
{
  "success": true,
  "deleted": {
    "messages": 45,
    "memories": 12
  }
}
```

Goals and tasks should still exist after conversation deletion.

### 7. Test Plan Generation Limit

```bash
# Generate first plan
curl -X POST http://localhost:3000/api/plans/generate \
  -H "Authorization: Bearer YOUR_TOKEN"

# Try to generate second plan (should return existing)
curl -X POST http://localhost:3000/api/plans/generate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Result**: Second request returns existing plan with message "Plan already exists for today"

### 8. Test Task CRUD Operations

**Create Task:**
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test task",
    "description": "Task description",
    "estimatedMinutes": 30,
    "priority": "high",
    "dueDate": "2026-05-29"
  }'
```

**Update Task:**
```bash
curl -X PATCH http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "TASK_ID",
    "status": "completed"
  }'
```

**Delete Task:**
```bash
curl -X DELETE "http://localhost:3000/api/tasks?id=TASK_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Result**: All operations succeed, data updates correctly

### 9. Test Report Generation

```bash
curl -X POST http://localhost:3000/api/reports/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "reportType": "weekly",
    "startDate": "2026-05-22",
    "endDate": "2026-05-28"
  }'
```

**Expected Result**:
```json
{
  "success": true,
  "report": {
    "metrics": {
      "completionPercentage": 75.5,
      "dailyConsistency": 85.7
    },
    "aiAnalysis": "..."
  },
  "reportId": "UUID"
}
```

### 10. Test User Onboarding Flow

1. **Register**: Visit `/signup`, create account
2. **Check Redirect**: Should redirect to `/onboarding` (not dashboard)
3. **Complete Onboarding**: Answer all questions
4. **Check Dashboard Access**: Should redirect to `/dashboard` after completion
5. **Verify Data**: Check that goals, commitments, identity_signals are created

---

## 🚀 Deployment Steps

### 1. Apply Database Migrations to Production

```bash
# Link to production project
npx supabase link --project-ref YOUR_PROJECT_REF

# Apply migrations
npx supabase db push

# Verify
npx supabase db remote commit
```

### 2. Deploy Edge Function

```bash
# Navigate to functions directory
cd supabase/functions

# Deploy generate-daily-tasks function
npx supabase functions deploy generate-daily-tasks

# Get function URL
npx supabase functions list
```

**Expected Output**:
```
Function: generate-daily-tasks
Status: ACTIVE
URL: https://PROJECT_ID.supabase.co/functions/v1/generate-daily-tasks
```

### 3. Set Up Cron Job for Daily Task Generation

**Option A: Supabase Edge Functions Cron (Recommended)**

In Supabase Dashboard → Edge Functions → generate-daily-tasks:
- Enable cron schedule
- Set schedule: `0 6 * * *` (6 AM daily)
- Test the function

**Option B: pg_cron (Database-level)**

```sql
-- Schedule daily task generation at 6 AM
SELECT cron.schedule(
  'generate-daily-tasks',
  '0 6 * * *', 
  $$
  SELECT generate_daily_tasks(id, CURRENT_DATE)
  FROM profiles
  WHERE onboarding_completed = true;
  $$
);

-- Verify cron job created
SELECT * FROM cron.job;
```

### 4. Test Edge Function

**Using curl:**
```bash
curl -X POST https://PROJECT_ID.supabase.co/functions/v1/generate-daily-tasks \
  -H "Authorization: Bearer ANON_KEY"
```

**Expected Response:**
```json
{
  "success": true,
  "totalUsers": 5,
  "usersProcessed": 5,
  "totalTasksGenerated": 15,
  "timestamp": "2026-05-28T..."
}
```

### 5. Deploy Frontend to Production

```bash
# Build for production
npm run build

# Deploy to Vercel (or your hosting platform)
vercel deploy --prod

# Or push to main branch for auto-deployment
git add .
git commit -m "Apply comprehensive fixes"
git push origin main
```

### 6. Environment Variables Check

Ensure these are set in production:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENAI_API_KEY=sk-...
```

---

## 🧹 Post-Deployment Cleanup

### 1. Remove Old Migrations (if any)

```bash
# List migrations
ls supabase/migrations/

# Remove old/conflicting migrations
rm supabase/migrations/013_fix_identity_signals_column.sql
rm supabase/migrations/014_fix_onboarding_completion.sql
```

### 2. Clear Old Documentation

```bash
# Keep only:
- README.md
- SETUP_GUIDE.md
- COMPREHENSIVE_FIXES_SUMMARY.md

# Remove (if they exist):
- FIXES_APPLIED.md
- FIX_SUMMARY.md
- QUICK_FIX_GUIDE.md
```

### 3. Verify Git Status

```bash
git status
git log --oneline -10

# Create a clean commit
git add .
git commit -m "feat: comprehensive system improvements

- Add email storage to profiles
- Fix identity signals column name
- Implement specific task generation
- Add task CRUD with time tracking
- Scope conversation deletion
- Limit daily plan generation
- Add AI-powered report generation
- Improve authentication flow
- Add cascade deletes"

git push origin main
```

---

## 🐛 Troubleshooting

### Issue: Migration fails with "column already exists"

**Solution**: Migration has idempotent checks (`IF NOT EXISTS`, `DROP IF EXISTS`). Run reset:
```bash
npx supabase db reset --local
```

### Issue: Edge function deployment fails

**Solution**:
1. Check Docker is running
2. Verify file exists: `supabase/functions/generate-daily-tasks/index.ts`
3. Try from project root, not functions folder:
```bash
cd c:\Users\yoges\OneDrive\Desktop\MentalAI
npx supabase functions deploy generate-daily-tasks
```

### Issue: RLS policies blocking queries

**Solution**: Check user is authenticated and owns the data:
```sql
-- Check current user
SELECT auth.uid();

-- Check data ownership
SELECT user_id FROM tasks WHERE id = 'TASK_ID';

-- Temporarily disable RLS for testing (local only!)
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
```

### Issue: Task generation creates generic tasks

**Solution**: Ensure using migration 015 with improved function:
```sql
-- Check function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'generate_daily_tasks';

-- Test function directly
SELECT generate_daily_tasks('USER_ID', CURRENT_DATE);
```

---

## ✅ Success Indicators

After deployment, verify:

- [ ] New users can register and complete onboarding
- [ ] Email is stored in profiles table
- [ ] Daily tasks are specific and actionable
- [ ] Tasks can be created, edited, and deleted
- [ ] Reports show consistency metrics
- [ ] Only one plan per day can be generated
- [ ] Deleting conversation doesn't delete other data
- [ ] Deleting user removes all their data
- [ ] Edge function runs daily and generates tasks
- [ ] No console errors in browser
- [ ] All API endpoints return proper responses

---

## 📞 Support

If issues persist:
1. Check Supabase logs: Dashboard → Logs
2. Check browser console for errors
3. Verify environment variables are set
4. Test with a fresh user account
5. Review migration history: `SELECT * FROM schema_migrations;`

---

**Last Updated**: May 28, 2026
