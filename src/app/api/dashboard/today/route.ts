import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCognitiveState } from "@/lib/ai/orchestrator/cognition-engine";
import { buildDashboardCoachBriefing } from "@/lib/dashboard/setup-facts";
import { selectDashboardTasks } from "@/lib/dashboard/pending-tasks";
import { computeGoalHealth } from "@/lib/plans/goal-health";
import { trackDailyReturn } from "@/lib/analytics/track-event";
import { getUserModel } from "@/lib/user-model/loader";
import { formatUserModelSummary, userModelToCoachBriefing } from "@/lib/user-model/format-for-prompt";
import { buildPersonalBriefing } from "@/lib/dashboard/personal-briefing";

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
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const [profileRes, tasksRes, initiativesRes, planRes, cogState, userModel, yesterdayTasksRes] =
    await Promise.all([
      supabase.from("profiles").select("full_name, current_focus_goal_id, current_focus_until").eq("id", user.id).single(),
      supabase
        .from("tasks")
        .select("id, title, status, due_date, auto_generated, created_at, goal_id")
        .eq("user_id", user.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("goals")
        .select("id, title, life_area, progress, last_action_at, target_date, status, description")
        .eq("user_id", user.id)
        .eq("goal_kind", "execution")
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
      supabase
        .from("tasks")
        .select("id, title, status, due_date, completed_at, auto_generated")
        .eq("user_id", user.id)
        .gte("due_date", yesterdayStr)
        .lte("due_date", yesterdayStr),
    ]);

  const planContent = planRes.data?.plan_content as {
    whatMattersNow?: string;
    planningContext?: { coachInsight?: string };
    tasks?: Array<{ title: string; status?: string }>;
  } | null;

  const firstName = profileRes.data?.full_name?.split(" ")[0] || "there";
  const allTasks = (tasksRes.data || []).filter((t) =>
    ["pending", "in_progress", "completed"].includes(t.status)
  );
  const completedToday = allTasks.filter((t) => t.status === "completed").length;
  const planTaskCount = planContent?.tasks?.length ?? 0;
  const focusTasks = selectDashboardTasks(
    allTasks.filter((t) => t.status !== "completed"),
    today,
    5
  );
  const initiatives = initiativesRes.data || [];

  const currentMilestone = userModel.currentMilestone;
  const coachBriefing = await buildDashboardCoachBriefing(supabase, user.id, {
    whatMattersNow: planContent?.planningContext?.coachInsight || planContent?.whatMattersNow,
    currentMilestone,
  });

  const modelSummary = formatUserModelSummary(userModel);
  const coachBriefingFromModel = userModelToCoachBriefing(userModel);
  const focusId = userModel.currentFocus.initiativeId || profileRes.data?.current_focus_goal_id;
  const focusInit = focusId ? initiatives.find((i) => i.id === focusId) : initiatives[0];

  const focusTitle = userModel.currentFocus.title || focusInit?.title || null;
  const focusHealth = focusInit
    ? computeGoalHealth({
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

  const yesterdayTasks = yesterdayTasksRes.data || [];
  const yesterdayCompleted = yesterdayTasks.filter((t) => t.status === "completed");
  const yesterdayWin =
    yesterdayCompleted.find((t) => !t.auto_generated)?.title ||
    yesterdayCompleted[0]?.title ||
    null;

  const personalBriefing = buildPersonalBriefing({
    model: userModel,
    hour,
    focusTitle,
    focusTasks: focusTasks.map((t) => ({ title: t.title, status: t.status })),
    completedToday,
    totalToday: planTaskCount || focusTasks.length + completedToday,
    firstName,
    yesterdayCompleted: yesterdayCompleted.length,
    yesterdayTotal: yesterdayTasks.length,
    yesterdayWin,
  });

  return NextResponse.json({
    greeting: personalBriefing.headline,
    personalBriefing,
    whatMattersNow:
      coachBriefing.mattersToday ||
      userModel.primaryOutcome.headline ||
      planContent?.planningContext?.coachInsight ||
      planContent?.whatMattersNow ||
      null,
    coachBriefing: {
      ...coachBriefing,
      insight: coachBriefingFromModel.mentorBrief,
      mentorBrief: coachBriefingFromModel.mentorBrief,
      stillLearning: coachBriefingFromModel.stillLearning,
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
