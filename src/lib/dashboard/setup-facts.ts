import type { SupabaseClient } from "@supabase/supabase-js";

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
  const [goalsRes, initRes, oppRes, milestoneRes] = await Promise.all([
    supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("initiatives")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("initiative_milestones")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("status", "completed"),
  ]);

  const directionCount = goalsRes.count ?? 0;
  const activeInitiatives = initRes.count ?? 0;
  const opportunityCount = oppRes.count ?? 0;
  const plannedMilestones = milestoneRes.count ?? 0;

  const bullets = [
    `${directionCount} long-term direction${directionCount === 1 ? "" : "s"}`,
    `${activeInitiatives} active initiative${activeInitiatives === 1 ? "" : "s"}`,
    `${opportunityCount} opportunit${opportunityCount === 1 ? "y" : "ies"}`,
    `${plannedMilestones} planned milestone${plannedMilestones === 1 ? "" : "s"}`,
  ];

  const footer =
    activeInitiatives === 0
      ? "Add an initiative with a deadline to unlock today's plan."
      : "More completed tasks and reflections will sharpen daily planning.";

  return {
    directionCount,
    activeInitiatives,
    opportunityCount,
    plannedMilestones,
    bullets,
    footer,
  };
}
