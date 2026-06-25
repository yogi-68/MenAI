import { computeGoalHealth } from "@/lib/plans/goal-health";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackProductEvent } from "@/lib/analytics/track-event";

export interface MomentumScore {
  score: number;
  label: "surging" | "building" | "steady" | "slowing" | "stalled";
  factors: string[];
  executionRate7d: number;
  weightedCompletion: number;
  initiativeProgress: number;
  consecutiveActiveDays: number;
  opportunitiesActedOn: number;
}

function scoreLabel(score: number): MomentumScore["label"] {
  if (score >= 80) return "surging";
  if (score >= 65) return "building";
  if (score >= 45) return "steady";
  if (score >= 25) return "slowing";
  return "stalled";
}

export async function computeMomentumScore(
  supabase: SupabaseClient,
  userId: string
): Promise<MomentumScore> {
  const now = new Date();
  const d14 = new Date(now);
  d14.setDate(d14.getDate() - 14);
  const since14 = d14.toISOString().split("T")[0];
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const since7 = d7.toISOString().split("T")[0];

  const [execution, tasksRes, initiativesRes, reflectionsRes, opportunitiesRes] =
    await Promise.all([
      fetchExecutionMetrics(supabase, userId),
      supabase
        .from("tasks")
        .select("status, estimated_minutes, auto_generated, due_date, completed_at")
        .eq("user_id", userId)
        .gte("due_date", since14)
        .not("due_date", "is", null),
      supabase
        .from("goals")
        .select("title, status, target_date, last_action_at, progress")
        .eq("user_id", userId)
        .eq("goal_kind", "execution")
        .eq("status", "active"),
      supabase
        .from("daily_reflections")
        .select("reflection_date")
        .eq("user_id", userId)
        .gte("reflection_date", since14)
        .order("reflection_date", { ascending: false }),
      supabase
        .from("opportunities")
        .select("status, updated_at")
        .eq("user_id", userId)
        .gte("updated_at", since7),
    ]);

  const tasks = tasksRes.data || [];
  const initiatives = initiativesRes.data || [];
  const reflections = reflectionsRes.data || [];

  // Weighted completion: ambitious tasks (longer estimates) count more
  const planned = tasks.filter((t) => t.auto_generated);
  let weightedTotal = 0;
  let weightedDone = 0;
  for (const t of planned) {
    const weight = Math.min(3, Math.max(1, (t.estimated_minutes || 60) / 60));
    weightedTotal += weight;
    if (t.status === "completed") weightedDone += weight;
  }
  const weightedCompletion =
    weightedTotal > 0 ? Math.round((weightedDone / weightedTotal) * 100) : 0;

  // Initiative progress: average progress + rescued at-risk
  let initiativeProgress = 0;
  let rescuedAtRisk = 0;
  if (initiatives.length > 0) {
    initiativeProgress = Math.round(
      initiatives.reduce((s, i) => s + (i.progress || 0), 0) / initiatives.length
    );
    for (const i of initiatives) {
      const health = computeGoalHealth({
        status: i.status,
        targetDate: i.target_date,
        lastActionAt: i.last_action_at,
        progress: i.progress,
      });
      if (health.health === "on_track" && health.daysSinceLastAction !== null && health.daysSinceLastAction <= 3) {
        rescuedAtRisk += 1;
      }
    }
  }

  // Consecutive active days (reflection or task completion)
  const activeDates = new Set<string>();
  for (const r of reflections) activeDates.add(r.reflection_date);
  for (const t of tasks) {
    if (t.status === "completed" && t.completed_at) {
      activeDates.add(t.completed_at.split("T")[0]);
    }
  }
  let consecutiveActiveDays = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (true) {
    const key = cursor.toISOString().split("T")[0];
    if (!activeDates.has(key)) break;
    consecutiveActiveDays += 1;
    cursor.setDate(cursor.getDate() - 1);
    if (consecutiveActiveDays > 30) break;
  }

  const opportunitiesActedOn = (opportunitiesRes.data || []).filter(
    (o) => o.status === "acted_on"
  ).length;

  const executionRate7d = execution.last7Days.rate;

  // Composite score (0-100)
  let score = 0;
  const factors: string[] = [];

  score += Math.round(weightedCompletion * 0.35);
  if (weightedCompletion >= 50) factors.push(`Weighted completion ${weightedCompletion}%`);

  score += Math.round(executionRate7d * 0.2);
  if (executionRate7d > 0) factors.push(`7-day execution ${executionRate7d}%`);

  score += Math.round(Math.min(20, initiativeProgress * 0.2));
  if (initiativeProgress > 0) factors.push(`Initiative progress ${initiativeProgress}%`);

  score += Math.min(10, rescuedAtRisk * 5);
  if (rescuedAtRisk > 0) factors.push(`${rescuedAtRisk} initiative(s) re-engaged`);

  score += Math.min(10, opportunitiesActedOn * 5);
  if (opportunitiesActedOn > 0) factors.push(`${opportunitiesActedOn} opportunit${opportunitiesActedOn === 1 ? "y" : "ies"} acted on`);

  score += Math.min(15, consecutiveActiveDays * 3);
  if (consecutiveActiveDays >= 2) factors.push(`${consecutiveActiveDays} consecutive active days`);

  score = Math.min(100, Math.max(0, score));

  if (factors.length === 0) {
    if (executionRate7d === 0 && initiatives.length === 0) {
      factors.push("No initiatives or completed tasks logged yet");
    } else if (executionRate7d === 0) {
      factors.push("7-day execution rate: 0% on planned tasks");
    }
    if (reflections.length === 0) {
      factors.push("No daily reflections in the last 14 days");
    }
  }

  return {
    score,
    label: scoreLabel(score),
    factors,
    executionRate7d,
    weightedCompletion,
    initiativeProgress,
    consecutiveActiveDays,
    opportunitiesActedOn,
  };
}

export async function computePlanReturnRate(
  supabase: SupabaseClient,
  userId: string
): Promise<{ rate7d: number; returned: number; total: number }> {
  const d7 = new Date();
  d7.setDate(d7.getDate() - 7);
  const since = d7.toISOString().split("T")[0];

  const { data } = await supabase
    .from("plan_engagement")
    .select("returned_next_day")
    .eq("user_id", userId)
    .gte("plan_date", since)
    .lt("plan_date", new Date().toISOString().split("T")[0]);

  const rows = data || [];
  const returned = rows.filter((r) => r.returned_next_day).length;
  const total = rows.length;
  return {
    rate7d: total > 0 ? Math.round((returned / total) * 100) : 0,
    returned,
    total,
  };
}

export async function recordPlanGeneration(
  supabase: SupabaseClient,
  userId: string,
  planDate: string
): Promise<void> {
  await supabase.from("plan_engagement").upsert(
    { user_id: userId, plan_date: planDate, plan_generated_at: new Date().toISOString() },
    { onConflict: "user_id,plan_date", ignoreDuplicates: true }
  );

  // Mark yesterday's plan as returned if user is back today
  const yesterday = new Date(planDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split("T")[0];

  await supabase
    .from("plan_engagement")
    .update({ returned_next_day: true, returned_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("plan_date", yStr)
    .eq("returned_next_day", false);

  trackProductEvent(userId, "daily_return", { plan_date: planDate }).catch(() => {});
}
