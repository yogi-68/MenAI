import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoalRow, InitiativeRow } from "@/lib/user-model/types";

export interface ExecutionContext {
  profile: {
    full_name: string | null;
    vision: string | null;
    current_focus_goal_id: string | null;
    current_focus_until: string | null;
  } | null;
  initiatives: InitiativeRow[];
  goals: GoalRow[];
  primaryInitiative: InitiativeRow | null;
  focusInitiativeId: string | null;
  opportunities: Array<{ title: string; urgency: string; due_date: string | null }>;
  identitySignals: Array<{ description: string; long_term_direction: string | null }>;
  completedTasks7d: number;
  reflections7d: number;
  currentMilestone: { title: string; initiativeId: string } | null;
  recentTimelineHeadline: string | null;
}

/** Active execution focus: explicit focus id, else most recently acted-on initiative. */
export function resolvePrimaryInitiative(
  initiatives: InitiativeRow[],
  focusInitiativeId: string | null | undefined
): InitiativeRow | null {
  if (focusInitiativeId) {
    const focused = initiatives.find((i) => i.id === focusInitiativeId && i.status === "active");
    if (focused) return focused;
  }
  const sorted = [...initiatives]
    .filter((i) => i.status === "active")
    .sort((a, b) => {
      const aTs = a.last_action_at || "";
      const bTs = b.last_action_at || "";
      return bTs.localeCompare(aTs);
    });
  return sorted[0] ?? null;
}

/** If profile focus points to inactive/missing initiative, return a valid replacement id. */
export function repairFocusInitiativeId(
  initiatives: InitiativeRow[],
  focusInitiativeId: string | null | undefined
): string | null {
  const primary = resolvePrimaryInitiative(initiatives, focusInitiativeId);
  return primary?.id ?? null;
}

/** Put primary initiative first; remaining sorted by target_date. */
export function orderInitiativesWithPrimaryFirst(
  initiatives: InitiativeRow[],
  primaryId: string | null
): InitiativeRow[] {
  if (!primaryId) {
    return [...initiatives].sort((a, b) =>
      (a.target_date || "9999").localeCompare(b.target_date || "9999")
    );
  }
  const primary = initiatives.find((i) => i.id === primaryId);
  const rest = initiatives
    .filter((i) => i.id !== primaryId)
    .sort((a, b) => (a.target_date || "9999").localeCompare(b.target_date || "9999"));
  return primary ? [primary, ...rest] : rest;
}

export async function loadExecutionContext(
  supabase: SupabaseClient,
  userId: string
): Promise<ExecutionContext> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoIso = sevenDaysAgo.toISOString();

  const [
    profileRes,
    initiativesRes,
    goalsRes,
    opportunitiesRes,
    signalsRes,
    tasksCountRes,
    reflectionsCountRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, vision, current_focus_goal_id, current_focus_until")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("id, title, description, target_date, life_area, last_action_at, status, progress, parent_goal_id")
      .eq("user_id", userId)
      .eq("goal_kind", "execution")
      .eq("status", "active")
      .order("last_action_at", { ascending: false, nullsFirst: false })
      .limit(12),
    supabase
      .from("goals")
      .select("id, title, description, target_date, category")
      .eq("user_id", userId)
      .eq("goal_kind", "direction")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("opportunities")
      .select("title, urgency, due_date")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    supabase
      .from("identity_signals")
      .select("description, long_term_direction")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgoIso),
    supabase
      .from("daily_reflections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("reflection_date", sevenDaysAgoIso.split("T")[0]),
  ]);

  const profile = profileRes.data;
  const initiatives = initiativesRes.data || [];
  let focusInitiativeId = profile?.current_focus_goal_id ?? null;
  const repairedFocusId = repairFocusInitiativeId(initiatives, focusInitiativeId);
  if (repairedFocusId !== focusInitiativeId && repairedFocusId && profile) {
    focusInitiativeId = repairedFocusId;
    await supabase
      .from("profiles")
      .update({
        current_focus_goal_id: repairedFocusId,
        current_focus_until:
          initiatives.find((i) => i.id === repairedFocusId)?.target_date ?? profile.current_focus_until,
      })
      .eq("id", userId);
  }
  const primaryInitiative = resolvePrimaryInitiative(initiatives, focusInitiativeId);

  let currentMilestone: { title: string; initiativeId: string } | null = null;
  if (primaryInitiative) {
    const { data: ms } = await supabase
      .from("goal_milestones")
      .select("title, goal_id")
      .eq("user_id", userId)
      .eq("goal_id", primaryInitiative.id)
      .eq("status", "in_progress")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ms) {
      currentMilestone = { title: ms.title, initiativeId: ms.goal_id };
    }
  }

  const recentTimelineHeadline = null;

  return {
    profile,
    initiatives,
    goals: goalsRes.data || [],
    primaryInitiative,
    focusInitiativeId,
    opportunities: opportunitiesRes.data || [],
    identitySignals: signalsRes.data || [],
    completedTasks7d: tasksCountRes.count ?? 0,
    reflections7d: reflectionsCountRes.count ?? 0,
    currentMilestone,
    recentTimelineHeadline,
  };
}
