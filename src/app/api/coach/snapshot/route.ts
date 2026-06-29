import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/context/user-context";
import type { GoalConfidenceBreakdown } from "@/lib/plans/goal-confidence";

export const runtime = "nodejs";

/** GET /api/coach/snapshot — lightweight data for persistent coach rail */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().split("T")[0];

  const [userContext, planAndProfile] = await Promise.all([
    getUserContext(supabase, user.id),
    Promise.all([
      supabase
        .from("daily_plans")
        .select("plan_content")
        .eq("user_id", user.id)
        .eq("plan_date", today)
        .maybeSingle(),
      supabase
        .from("mentor_memories")
        .select("text")
        .eq("user_id", user.id)
        .eq("memory_type", "daily_note")
        .eq("status", "active")
        .order("last_mentioned_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("user_model")
        .eq("id", user.id)
        .maybeSingle(),
    ]),
  ]);

  const [todayPlan, dailyNoteRes, profileRes] = planAndProfile;
  const calibrationQuestion =
    (todayPlan?.data?.plan_content as { calibrationQuestion?: string } | null)?.calibrationQuestion ??
    null;
  const dailyNote = calibrationQuestion ?? dailyNoteRes.data?.text ?? null;

  const phase = userContext.rhythmPhase;
  const completed = userContext.todayPlan.filter((t) => t.status === "completed").length;
  const expected = userContext.todayPlan.length;

  const goalConfidence =
    (profileRes.data?.user_model as { goalConfidence?: Record<string, GoalConfidenceBreakdown> } | null)
      ?.goalConfidence ?? {};

  let precisionCTA: { goalId: string; goalTitle: string; score: number; factor: string } | null = null;
  const lowEntries = Object.entries(goalConfidence)
    .filter(([, b]) => b.total < 70 && (b.missingFactors?.length ?? 0) > 0)
    .sort(([, a], [, b]) => a.total - b.total);

  if (lowEntries.length > 0) {
    const [goalId, breakdown] = lowEntries[0];
    const goalTitle = userContext.activeGoals.find((g) => g.id === goalId)?.title;
    if (goalTitle) {
      precisionCTA = {
        goalId,
        goalTitle,
        score: breakdown.total,
        factor: breakdown.missingFactors[0]?.factor ?? "deadline",
      };
    }
  }

  let resolvedDailyNote = dailyNote;
  if (!resolvedDailyNote && expected > 0 && completed === 0) {
    resolvedDailyNote =
      "Day 1. Your goals are set. Complete today's first task — that's the only thing that matters right now.";
  }

  return NextResponse.json({
    score: userContext.scoreToday,
    phase,
    statusLabel: `Score ${userContext.scoreToday} · ${phase}`,
    tasksCompletedToday: completed,
    tasksDueToday: expected,
    knows: userContext.knowledgeBullets,
    lastAchievement: userContext.lastAchievement,
    dailyNote: resolvedDailyNote,
    precisionCTA,
  });
}
