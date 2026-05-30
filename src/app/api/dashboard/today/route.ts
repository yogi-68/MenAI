import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCognitiveState } from "@/lib/ai/orchestrator/cognition-engine";
import { buildSetupFacts } from "@/lib/dashboard/setup-facts";
import { selectDashboardTasks } from "@/lib/dashboard/pending-tasks";
import { computeInitiativeHealth } from "@/lib/plans/initiative-health";
import { trackDailyReturn } from "@/lib/analytics/track-event";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  trackDailyReturn(user.id).catch(() => {});

  const today = new Date().toISOString().split("T")[0];
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  const [profileRes, tasksRes, initiativesRes, planRes, setupFacts, cogState] =
    await Promise.all([
      supabase.from("profiles").select("full_name, current_focus_initiative_id, current_focus_until").eq("id", user.id).single(),
      supabase
        .from("tasks")
        .select("id, title, status, due_date, auto_generated, created_at, initiative_id")
        .eq("user_id", user.id)
        .in("status", ["pending", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("initiatives")
        .select("id, title, life_area, progress, last_action_at, target_date, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("last_action_at", { ascending: false, nullsFirst: false })
        .limit(8),
      supabase
        .from("daily_plans")
        .select("plan_content")
        .eq("user_id", user.id)
        .eq("plan_date", today)
        .maybeSingle(),
      buildSetupFacts(supabase, user.id),
      buildCognitiveState(user.id),
    ]);

  const firstName = profileRes.data?.full_name?.split(" ")[0] || "there";
  const allTasks = tasksRes.data || [];
  const focusTasks = selectDashboardTasks(allTasks, today, 5);
  const initiatives = initiativesRes.data || [];

  const planContent = planRes.data?.plan_content as {
    whatMattersNow?: string;
    tasks?: Array<{ title: string }>;
  } | null;

  let topMomentumInitiative: string | null = null;
  if (initiatives.length > 0) {
    const scored = initiatives.map((i) => {
      const health = computeInitiativeHealth({
        status: i.status,
        targetDate: i.target_date,
        lastActionAt: i.last_action_at,
        progress: i.progress,
      });
      const recency = i.last_action_at ? new Date(i.last_action_at).getTime() : 0;
      return { title: i.title, score: recency + (health.health === "on_track" ? 1000 : 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    topMomentumInitiative = scored[0]?.title ?? null;
  }

  const topMomentum =
    initiatives.length > 0 && cogState.maturity_level !== "new" ? topMomentumInitiative : null;

  const focusId = profileRes.data?.current_focus_initiative_id;
  const focusInit = focusId ? initiatives.find((i) => i.id === focusId) : null;
  const currentFocus = focusInit
    ? {
        title: focusInit.title,
        until: profileRes.data?.current_focus_until || focusInit.target_date,
        health: computeInitiativeHealth({
          status: focusInit.status,
          targetDate: focusInit.target_date,
          lastActionAt: focusInit.last_action_at,
          progress: focusInit.progress,
        }),
      }
    : null;

  return NextResponse.json({
    greeting: `${timeOfDay}, ${firstName}.`,
    whatMattersNow: planContent?.whatMattersNow || null,
    currentFocus,
    focusTasks: focusTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
    })),
    hasPlan: Boolean(planRes.data),
    initiatives: initiatives.map((i) => ({
      id: i.id,
      title: i.title,
      lifeArea: i.life_area,
      progress: i.progress,
    })),
    topMomentumInitiative: topMomentum,
    setupFacts,
    hasInitiatives: initiatives.length > 0,
    maturityLevel: cogState.maturity_level,
    isEmptyState: initiatives.length === 0 && !planRes.data?.plan_content,
  });
}
