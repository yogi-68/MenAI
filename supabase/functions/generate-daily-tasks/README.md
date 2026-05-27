# Daily Task Generation

This Edge Function automatically generates daily tasks for all users based on their goals and priorities.

## How It Works

1. Runs daily (scheduled via cron)
2. Fetches all users who have completed onboarding
3. For each user, calls the `generate_daily_tasks()` PostgreSQL function
4. Generates up to 3 tasks per day based on:
   - Active goals (prioritized by importance)
   - User's daily priorities from onboarding
   - Previous task completion patterns

## Setup

### 1. Deploy the Function

```bash
supabase functions deploy generate-daily-tasks
```

### 2. Set up Cron Schedule

In your Supabase dashboard, go to Database > Cron Jobs and create a new job:

**Job Name**: `daily-task-generation`  
**Schedule**: `0 6 * * *` (6 AM UTC every day)  
**Command**:

```sql
SELECT
  net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-daily-tasks',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
```

Replace `YOUR_PROJECT_REF` and `YOUR_ANON_KEY` with your actual values.

### 3. Alternative: Manual Trigger

You can also manually trigger task generation via API:

```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/generate-daily-tasks \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Task Generation Logic

The function generates tasks based on:

- **High-priority goals**: Gets first priority for task generation
- **Goal category**: Uses user's daily priorities to prioritize relevant goals
- **Maximum 3 tasks/day**: Prevents overwhelming users
- **No duplicates**: Won't generate tasks if already generated for that day

## Monitoring

Check the `task_generation_log` table to monitor:
- When tasks were generated
- How many tasks per user
- Any errors that occurred

```sql
SELECT * FROM task_generation_log 
WHERE generation_date = CURRENT_DATE 
ORDER BY created_at DESC;
```
