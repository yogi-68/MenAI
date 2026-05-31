import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCognitiveState } from "@/lib/ai/orchestrator/cognition-engine";
import { buildDashboardCoachBriefing } from "@/lib/dashboard/setup-facts";
import { selectDashboardTasks } from "@/lib/dashboard/pending-tasks";
import { computeInitiativeHealth } from "@/lib/plans/initiative-health";
import { trackDailyReturn } from "@/lib/analytics/track-event";
import { getUserModel } from "@/lib/user-model/loader";
import { formatUserModelSummary, userModelToCoachBriefing } from "@/lib/user-model/format-for-prompt";

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

  const [profileRes, tasksRes, initiativesRes, planRes, cogState, userModel] =
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
        .select("id, title, life_area, progress, last_action_at, target_date, status, description")
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
      buildCognitiveState(user.id),
      getUserModel(supabase, user.id),
    ]);

  const firstName = profileRes.data?.full_name?.split(" ")[0] || "there";
  const allTasks = tasksRes.data || [];
  const focusTasks = selectDashboardTasks(allTasks, today, 5);
  const initiatives = initiativesRes.data || [];

  const planContent = planRes.data?.plan_content as {
    whatMattersNow?: string;
    planningContext?: { coachInsight?: string };
    tasks?: Array<{ title: string }>;
  } | null;

  const currentMilestone = userModel.currentMilestone;
  const coachBriefing = await buildDashboardCoachBriefing(supabase, user.id, {
    whatMattersNow: planContent?.planningContext?.coachInsight || planContent?.whatMattersNow,
    currentMilestone,
  });

  const modelSummary = formatUserModelSummary(userModel);
  const coachBriefingFromModel = userModelToCoachBriefing(userModel);
  const focusId = userModel.currentFocus.initiativeId || profileRes.data?.current_focus_initiative_id;
  const focusInit = focusId ? initiatives.find((i) => i.id === focusId) : initiatives[0];

  const focusTitle = userModel.currentFocus.title || focusInit?.title || null;
  const focusHealth = focusInit
    ? computeInitiativeHealth({
        status: focusInit.status,
        targetDate: focusInit.target_date,
        lastActionAt: focusInit.last_action_at,
        progress: focusInit.progress,
      })
    : null;

  const currentFocus =
    focusTitle && focusHealth
      ? {
          title: focusTitle,
          until: userModel.currentFocus.until || profileRes.data?.current_focus_until || focusInit?.target_date || null,
          health: focusHealth,
          primaryOutcome: userModel.primaryOutcome.headline,
        }
      : null;

  return NextResponse.json({
    greeting: `${timeOfDay}, ${firstName}.`,
    whatMattersNow:
      coachBriefing.mattersToday ||
      userModel.primaryOutcome.headline ||
      planContent?.planningContext?.coachInsight ||
      planContent?.whatMattersNow ||
      null,
    coachBriefing: {
      ...coachBriefing,
      understands: coachBriefingFromModel.understanding.known,
      stillNeeds: coachBriefingFromModel.understanding.unclear,
      insight: "",
    },
    userModel: {
      primaryOutcome: userModel.primaryOutcome.headline,
      currentFocusTitle: focusTitle,
      longTermThemes: modelSummary.longTerm,
      confidence: userModel.confidence,
      understanding: coachBriefingFromModel.understanding,
      activePortfolio: userModel.activePortfolio.map((p) => ({
        id: p.initiativeId,
        title: p.title,
        lifeArea: p.lifeArea,
        healthLabel: p.healthLabel,
        isFocus: p.isFocus,
      })),
      executionAllocation: userModel.executionAllocation.map((a) => ({
        initiativeId: a.initiativeId,
        title: a.title,
        percent: a.percent,
        role: a.role,
        rationale: a.rationale,
      })),
    },
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
      isPrimaryFocus: i.id === focusId,
    })),
    hasInitiatives: initiatives.length > 0,
    maturityLevel: cogState.maturity_level,
    isEmptyState: initiatives.length === 0 && !planRes.data?.plan_content,
  });
}
