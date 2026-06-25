import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";
import { TASKS_PER_GOAL } from "@/lib/plans/performance-score";

export interface TodayTaskStats {
  tasksCompletedToday: number;
  tasksDueToday: number;
  daysToNearestMilestone: number | null;
}

export async function fetchTodayTaskStats(
  supabase: SupabaseClient,
  userId: string
): Promise<TodayTaskStats> {
  const today = new Date().toISOString().split("T")[0];

  const [tasksRes, goals, milestonesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, status, goal_id, auto_generated")
      .eq("user_id", userId)
      .eq("due_date", today),
    fetchActiveExecutionGoals(supabase, userId, 12),
    supabase
      .from("goal_milestones")
      .select("goal_id, target_date, status")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"]),
  ]);

  const tasks = tasksRes.data || [];
  const goalIds = new Set(goals.map((g) => g.id));
  const planTasks = tasks.filter((t) => t.goal_id && goalIds.has(t.goal_id));
  const completed = planTasks.filter((t) => t.status === "completed").length;
  const expected = goals.length * TASKS_PER_GOAL;

  let daysToNearestMilestone: number | null = null;
  const now = Date.now();
  for (const m of milestonesRes.data || []) {
    if (!m.target_date) continue;
    const days = Math.ceil((new Date(m.target_date).getTime() - now) / 86400000);
    if (days >= 0 && (daysToNearestMilestone == null || days < daysToNearestMilestone)) {
      daysToNearestMilestone = days;
    }
  }

  for (const g of goals) {
    if (!g.target_date) continue;
    const days = Math.ceil((new Date(g.target_date).getTime() - now) / 86400000);
    if (days >= 0 && (daysToNearestMilestone == null || days < daysToNearestMilestone)) {
      daysToNearestMilestone = days;
    }
  }

  return {
    tasksCompletedToday: completed,
    tasksDueToday: expected > 0 ? expected : planTasks.length,
    daysToNearestMilestone,
  };
}
