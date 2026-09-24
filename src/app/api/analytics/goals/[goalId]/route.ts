import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeGoalAnalytics } from "@/lib/plans/performance-score";
import { computeGoalHealth } from "@/lib/plans/goal-health";
import { buildGoalAnalysis } from "@/lib/plans/coach-insights";
import { buildGoalPaceInsight } from "@/lib/analytics/goal-pace-insight";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ goalId: string }> }
) {
  const { goalId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const analytics = await computeGoalAnalytics(supabase, user.id, goalId);
  if (!analytics) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const goal = analytics.goal;
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_context")
    .eq("id", user.id)
    .maybeSingle();

  const health = computeGoalHealth({
    status: goal.status,
    targetDate: goal.target_date,
    lastActionAt: goal.last_action_at,
    progress: goal.progress ?? undefined,
  });

  const coaching = buildGoalAnalysis({
    domain: "general",
    initiativeTitle: goal.title,
    initiativeDescription: goal.description ?? undefined,
    targetDate: goal.target_date,
    lifeArea: goal.life_area ?? undefined,
    goalTexts: [goal.title],
    planContext: (profile?.plan_context as Record<string, unknown>) || {},
  });

  const paceInsight = buildGoalPaceInsight({
    targetDate: goal.target_date,
    remainingDays: analytics.remainingDays,
    progress: analytics.progress,
    dailyProgressNeeded: analytics.dailyProgressNeeded,
    dailyTrend: analytics.dailyTrend,
    estimatedCompletionDate: analytics.estimatedCompletionDate,
    tasksCompletedTotal: analytics.tasksCompletedTotal,
  });

  return NextResponse.json({
    ...analytics,
    health,
    paceInsight,
    coaching: {
      headline: coaching.headline,
      coachInsight: paceInsight,
      knownFacts: coaching.knownFacts.filter(
        (f) => !/Weekly milestone pace|Daily priority stack|Risk flags/i.test(f)
      ),
      onceKnown: coaching.onceKnown,
      daysRemaining: coaching.daysRemaining,
      deadlineLabel: coaching.deadlineLabel,
    },
  });
}
