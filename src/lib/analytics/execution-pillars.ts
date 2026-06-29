/**
 * Execution Pillars — Planning / Execution / Reflection (0–100 each).
 * Rule-based, no LLM. Main hero score = average of the three.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TASKS_PER_GOAL } from "@/lib/plans/performance-score";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";

export interface ExecutionPillars {
  planning: number;
  execution: number;
  reflection: number;
  /** Average of the three pillars */
  overall: number;
  labels: {
    planning: string;
    execution: string;
    reflection: string;
  };
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function computeExecutionPillars(
  supabase: SupabaseClient,
  userId: string
): Promise<ExecutionPillars> {
  const today = dateStr(new Date());
  const since7 = dateStr(daysAgo(7));

  const goals = await fetchActiveExecutionGoals(supabase, userId, 12);
  const goalIdList = goals.map((g) => g.id);

  const [milestonesRes, tasksRes, reflectionsRes] = await Promise.all([
    goalIdList.length > 0
      ? supabase.from("goal_milestones").select("goal_id").in("goal_id", goalIdList)
      : Promise.resolve({ data: [] as { goal_id: string }[] }),
    supabase
      .from("tasks")
      .select("status, due_date")
      .eq("user_id", userId)
      .gte("due_date", since7)
      .lte("due_date", today),
    supabase
      .from("daily_reflections")
      .select("reflection_date")
      .eq("user_id", userId)
      .gte("reflection_date", since7),
  ]);

  const goalsWithMilestone = new Set(
    (milestonesRes.data || []).map((m) => m.goal_id)
  );

  // Planning: deadline + milestone completeness
  let planningScore = 0;
  let planningLabel = "Add deadline + milestones";
  if (goals.length > 0) {
    let planningPoints = 0;
    for (const g of goals) {
      if (g.target_date) planningPoints += 50;
      if (goalsWithMilestone.has(g.id)) planningPoints += 50;
    }
    planningScore = Math.round(planningPoints / goals.length);
    if (planningScore >= 80) planningLabel = "Strong plan context";
    else if (planningScore >= 50) planningLabel = "Deadline set — add milestones";
    else if (goals.some((g) => g.target_date)) planningLabel = "Deadline set — milestones pending";
  }

  // Execution: tasks completed / planned (7d)
  const tasks = tasksRes.data || [];
  const planned = tasks.filter((t) =>
    ["pending", "in_progress", "completed", "skipped", "missed"].includes(t.status)
  ).length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const goalCount = Math.max(1, goals.length);
  const expectedWeekly = goalCount * TASKS_PER_GOAL * 7;
  const executionDenominator = Math.max(planned, expectedWeekly > 0 ? Math.min(expectedWeekly, planned || 1) : 1);
  const executionScore =
    planned > 0
      ? Math.round((completed / executionDenominator) * 100)
      : 0;
  const executionLabel =
    executionScore >= 70
      ? "Strong task completion"
      : executionScore > 0
        ? "Complete daily tasks"
        : "Complete daily tasks";

  // Reflection: days logged / 7
  const reflectionDays = new Set(
    (reflectionsRes.data || []).map((r) => r.reflection_date)
  ).size;
  const reflectionScore = Math.round((reflectionDays / 7) * 100);
  const reflectionLabel =
    reflectionScore >= 70
      ? "Consistent reflections"
      : reflectionDays > 0
        ? "Log end-of-day reflections"
        : "Log end-of-day reflections";

  const overall = Math.round((planningScore + executionScore + reflectionScore) / 3);

  return {
    planning: planningScore,
    execution: executionScore,
    reflection: reflectionScore,
    overall,
    labels: {
      planning: planningLabel,
      execution: executionLabel,
      reflection: reflectionLabel,
    },
  };
}
