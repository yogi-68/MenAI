import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCoachBriefing, type CoachBriefing } from "@/lib/plans/coach-insights";
import { loadPlanContextData } from "@/lib/plans/plan-interview";

export type { CoachBriefing };

export async function buildDashboardCoachBriefing(
  supabase: SupabaseClient,
  userId: string,
  extras?: {
    whatMattersNow?: string | null;
    currentMilestone?: string | null;
  }
): Promise<CoachBriefing> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [initiativesRes, goalsRes, tasksRes, reflectionsRes, planContext] = await Promise.all([
    supabase
      .from("initiatives")
      .select("title, description, target_date, life_area, last_action_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("target_date", { ascending: true, nullsFirst: false })
      .limit(3),
    supabase
      .from("goals")
      .select("title")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(5),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed")
      .gte("completed_at", sevenDaysAgo.toISOString()),
    supabase
      .from("daily_reflections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("reflection_date", sevenDaysAgo.toISOString().split("T")[0]),
    loadPlanContextData(supabase, userId),
  ]);

  return buildCoachBriefing({
    initiatives: initiativesRes.data || [],
    goals: goalsRes.data || [],
    planContext: planContext as Record<string, unknown>,
    completedTasks7d: tasksRes.count ?? 0,
    reflections7d: reflectionsRes.count ?? 0,
    whatMattersNow: extras?.whatMattersNow,
    currentMilestone: extras?.currentMilestone,
  });
}

/** @deprecated Use coachBriefing from buildDashboardCoachBriefing */
export interface SetupFacts {
  directionCount: number;
  activeInitiatives: number;
  opportunityCount: number;
  plannedMilestones: number;
  bullets: string[];
  footer: string;
}

export async function buildSetupFacts(
  supabase: SupabaseClient,
  userId: string
): Promise<SetupFacts> {
  const briefing = await buildDashboardCoachBriefing(supabase, userId);
  return {
    directionCount: 0,
    activeInitiatives: briefing.tryingToAchieve ? 1 : 0,
    opportunityCount: 0,
    plannedMilestones: 0,
    bullets: briefing.understands,
    footer: briefing.insight,
  };
}
