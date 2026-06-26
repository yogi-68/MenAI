import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserContext } from "@/lib/context/user-context";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";

interface PlanTaskRow {
  title: string;
  whyItMatters?: string;
  linkedInitiative?: string;
  linkedMilestone?: string;
  status?: string;
}

interface DailyPlanContent {
  tasks?: PlanTaskRow[];
  whatMattersNow?: string;
}

/** Build coach prompt block for today's plan. Pass UserContext to avoid duplicate goal/task fetches. */
export async function loadTodayPlanBlockForPrompt(
  supabase: SupabaseClient,
  userId: string,
  userContext?: UserContext
): Promise<string | null> {
  const today = new Date().toISOString().split("T")[0];

  const planRes = await supabase
    .from("daily_plans")
    .select("plan_content")
    .eq("user_id", userId)
    .eq("plan_date", today)
    .maybeSingle();

  const content = planRes.data?.plan_content as DailyPlanContent | null;
  const planTasks = content?.tasks ?? [];

  if (userContext) {
    if (planTasks.length === 0 && userContext.todayPlan.length === 0) {
      return content?.whatMattersNow
        ? `No tasks listed yet. Focus: ${content.whatMattersNow}`
        : null;
    }

    const lines: string[] = [];
    if (content?.whatMattersNow) {
      lines.push(`Focus: ${content.whatMattersNow}`);
    }
    lines.push("Today's tasks:");

    if (planTasks.length > 0) {
      for (const t of planTasks) {
        const status = t.status ?? "pending";
        const why =
          t.whyItMatters?.trim() ||
          (t.linkedMilestone ? `Advances milestone: ${t.linkedMilestone}` : "No rationale recorded");
        lines.push(
          `- [${status}] ${t.title}${t.linkedInitiative ? ` (${t.linkedInitiative})` : ""} — ${why}`
        );
      }
    } else {
      for (const t of userContext.todayPlan) {
        lines.push(
          `- [${t.status}] ${t.title}${t.goalTitle ? ` (${t.goalTitle})` : ""} — See task description`
        );
      }
    }

    return lines.join("\n");
  }

  const [goals, tasksRes] = await Promise.all([
    fetchActiveExecutionGoals(supabase, userId, 8),
    supabase
      .from("tasks")
      .select("id, title, status, goal_id, description")
      .eq("user_id", userId)
      .eq("due_date", today),
  ]);

  const dbTasks = tasksRes.data ?? [];
  const goalById = new Map(goals.map((g) => [g.id, g.title]));

  if (planTasks.length === 0 && dbTasks.length === 0) {
    return content?.whatMattersNow
      ? `No tasks listed yet. Focus: ${content.whatMattersNow}`
      : null;
  }

  const lines: string[] = [];

  if (content?.whatMattersNow) {
    lines.push(`Focus: ${content.whatMattersNow}`);
  }

  lines.push("Today's tasks:");

  if (planTasks.length > 0) {
    for (const t of planTasks) {
      const status = t.status ?? "pending";
      const why =
        t.whyItMatters?.trim() ||
        (t.linkedMilestone ? `Advances milestone: ${t.linkedMilestone}` : "No rationale recorded");
      lines.push(
        `- [${status}] ${t.title}${t.linkedInitiative ? ` (${t.linkedInitiative})` : ""} — ${why}`
      );
    }
  } else {
    for (const t of dbTasks) {
      const goalTitle = t.goal_id ? goalById.get(t.goal_id) : null;
      const whyLine = t.description?.split("\n")[0]?.trim() || "See task description";
      lines.push(
        `- [${t.status}] ${t.title}${goalTitle ? ` (${goalTitle})` : ""} — ${whyLine}`
      );
    }
  }

  return lines.join("\n");
}
