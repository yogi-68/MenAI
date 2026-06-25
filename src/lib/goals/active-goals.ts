import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExecutionGoalRow {
  id: string;
  title: string;
  description: string | null;
  success_criteria: string | null;
  target_date: string | null;
  progress: number | null;
  life_area: string | null;
  last_action_at: string | null;
  status: string;
  parent_goal_id: string | null;
  priority: string | null;
  goal_kind?: string | null;
}

const GOAL_SELECT =
  "id, title, description, success_criteria, target_date, progress, life_area, last_action_at, status, parent_goal_id, priority, goal_kind";

function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /goal_kind|does not exist/i.test(error.message || "");
}

/** Active execution goals — works pre- and post-migration 039. */
export async function fetchActiveExecutionGoals(
  supabase: SupabaseClient,
  userId: string,
  limit = 12
): Promise<ExecutionGoalRow[]> {
  const primary = await supabase
    .from("goals")
    .select(GOAL_SELECT)
    .eq("user_id", userId)
    .eq("goal_kind", "execution")
    .eq("status", "active")
    .order("target_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (!primary.error && (primary.data?.length ?? 0) > 0) {
    return primary.data as ExecutionGoalRow[];
  }

  if (!isMissingColumn(primary.error)) {
    const withDeadline = await supabase
      .from("goals")
      .select(GOAL_SELECT.replace(", goal_kind", ""))
      .eq("user_id", userId)
      .eq("status", "active")
      .not("target_date", "is", null)
      .order("target_date", { ascending: true, nullsFirst: false })
      .limit(limit);

    if ((withDeadline.data?.length ?? 0) > 0) {
      return (withDeadline.data || []) as unknown as ExecutionGoalRow[];
    }
  }

  const legacyInitiatives = await supabase
    .from("initiatives")
    .select(
      "id, title, description, success_criteria, target_date, progress, life_area, last_action_at, status, goal_id"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("target_date", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (!legacyInitiatives.error && (legacyInitiatives.data?.length ?? 0) > 0) {
    return legacyInitiatives.data.map((i) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      success_criteria: i.success_criteria ?? null,
      target_date: i.target_date,
      progress: i.progress,
      life_area: i.life_area,
      last_action_at: i.last_action_at,
      status: i.status,
      parent_goal_id: i.goal_id,
      priority: "medium",
      goal_kind: "execution",
    }));
  }

  const fallback = await supabase
    .from("goals")
    .select(GOAL_SELECT.replace(", goal_kind", ""))
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(limit);

  return (fallback.data || []) as unknown as ExecutionGoalRow[];
}

export async function countActiveExecutionGoals(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const goals = await fetchActiveExecutionGoals(supabase, userId, 50);
  return goals.length;
}
