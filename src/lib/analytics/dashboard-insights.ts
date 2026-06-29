/**
 * Rule-based dashboard insights — no LLM, real DB signals only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PerformanceScore } from "@/lib/plans/performance-score";
import type { ExecutionPillars } from "@/lib/analytics/execution-pillars";

export function buildCoachInsightQuote(opts: {
  performance: PerformanceScore;
  pillars: ExecutionPillars;
  lastAchievement: string | null;
  tasksCompletedToday: number;
  tasksDueToday: number;
  primaryGoalTitle: string | null;
  daysRemaining: number | null;
}): string {
  const {
    performance,
    pillars,
    lastAchievement,
    tasksCompletedToday,
    tasksDueToday,
    primaryGoalTitle,
    daysRemaining,
  } = opts;

  if (tasksDueToday > 0 && tasksCompletedToday === 0 && pillars.overall < 30) {
    const goalPart = primaryGoalTitle ? ` on ${primaryGoalTitle}` : "";
    const deadlinePart =
      daysRemaining != null && daysRemaining > 0
        ? ` ${daysRemaining} days left${goalPart}.`
        : ".";
    return `Day 1.${deadlinePart} Complete today's first task — that's the only thing that matters right now.`;
  }

  if (performance.weekDelta > 0) {
    return `Up ${performance.weekDelta} pts vs last week. Keep the streak — momentum compounds when you finish before noon.`;
  }

  if (performance.streak >= 3) {
    return `${performance.streak}-day streak. ${lastAchievement ? `Building on: ${lastAchievement.slice(0, 80)}.` : "Protect the rhythm — skip nothing today."}`;
  }

  if (pillars.planning < 50) {
    return "Your plan is running blind without a deadline. Add one in Coach — tasks get specific immediately.";
  }

  if (pillars.execution < 40 && performance.completionPct < 50) {
    return "Execution is lagging. Start with the smallest task today — not the most important one.";
  }

  if (lastAchievement) {
    return `Recent win: ${lastAchievement.slice(0, 100)}. Use that momentum on today's highest-leverage task.`;
  }

  return "Complete one task today. Score and plan precision both move when you execute — not when you plan.";
}

export async function fetchNextMilestone(
  supabase: SupabaseClient,
  userId: string
): Promise<{ title: string; progress: number; goalTitle: string } | null> {
  const { data: goals } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("goal_kind", "execution");

  const goalIds = (goals || []).map((g) => g.id);
  if (goalIds.length === 0) return null;

  const { data: milestones } = await supabase
    .from("goal_milestones")
    .select("title, status, progress, goals(title)")
    .in("goal_id", goalIds)
    .neq("status", "completed")
    .order("sort_order", { ascending: true })
    .limit(1);

  const m = milestones?.[0];
  if (!m?.title) return null;

  const goalTitle = (m.goals as { title?: string } | null)?.title ?? "Focus";

  return {
    title: m.title,
    progress: m.progress ?? 0,
    goalTitle,
  };
}

export async function fetchAnalyticsRowData(
  supabase: SupabaseClient,
  userId: string,
  performance: PerformanceScore
) {
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);
  const since30Str = since30.toISOString().split("T")[0];

  const [monthTasksRes, patternsRes, confidenceGoals] = await Promise.all([
    supabase
      .from("tasks")
      .select("status, completed_at")
      .eq("user_id", userId)
      .gte("due_date", since30Str),
    supabase
      .from("execution_patterns")
      .select("pattern, occurrences")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("occurrences", { ascending: false })
      .limit(5),
    supabase
      .from("goal_progress_snapshots")
      .select("goal_id, snapshot_date, score")
      .eq("user_id", userId)
      .gte("snapshot_date", since30Str)
      .order("snapshot_date", { ascending: true }),
  ]);

  const monthTasks = monthTasksRes.data || [];
  const planned = monthTasks.length;
  const completed = monthTasks.filter((t) => t.status === "completed").length;
  const skipped = monthTasks.filter((t) => t.status === "skipped").length;
  const missed = monthTasks.filter((t) => t.status === "missed").length;
  const planAdherence = planned > 0 ? Math.round((completed / planned) * 100) : 0;

  const hourBuckets = { morning: 0, afternoon: 0, evening: 0 };
  for (const t of monthTasks) {
    if (t.status !== "completed" || !t.completed_at) continue;
    const hour = new Date(t.completed_at).getHours();
    if (hour < 12) hourBuckets.morning++;
    else if (hour < 18) hourBuckets.afternoon++;
    else hourBuckets.evening++;
  }

  const executionBlockers = (patternsRes.data || []).map((p) => ({
    label: p.pattern,
    count: p.occurrences ?? 1,
  }));

  const confidenceByDate = new Map<string, number[]>();
  for (const row of confidenceGoals.data || []) {
    const list = confidenceByDate.get(row.snapshot_date) ?? [];
    list.push(row.score ?? 0);
    confidenceByDate.set(row.snapshot_date, list);
  }
  const confidenceTrend = [...confidenceByDate.entries()]
    .slice(-7)
    .map(([date, scores]) => ({
      date,
      label: new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
      }),
      value: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    }));

  return {
    planAdherence,
    taskOutcomes: { completed, skipped, missed },
    activeTime: [
      { label: "Morning", value: hourBuckets.morning },
      { label: "Afternoon", value: hourBuckets.afternoon },
      { label: "Evening", value: hourBuckets.evening },
    ],
    executionBlockers,
    confidenceTrend,
  };
}
