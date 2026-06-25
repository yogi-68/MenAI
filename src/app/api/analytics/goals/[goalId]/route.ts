import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeGoalAnalytics } from "@/lib/plans/performance-score";
import { computeGoalHealth } from "@/lib/plans/goal-health";
import { buildGoalAnalysis } from "@/lib/plans/coach-insights";

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
    progress: goal.progress,
  });

  const coaching = buildGoalAnalysis({
    domain: "general",
    initiativeTitle: goal.title,
    initiativeDescription: goal.description,
    targetDate: goal.target_date,
    lifeArea: goal.life_area,
    goalTexts: [goal.title],
    planContext: (profile?.plan_context as Record<string, unknown>) || {},
  });

  return NextResponse.json({
    ...analytics,
    health,
    coaching: {
      headline: coaching.headline,
      coachInsight: coaching.coachInsight,
      knownFacts: coaching.knownFacts,
      onceKnown: coaching.onceKnown,
      daysRemaining: coaching.daysRemaining,
      deadlineLabel: coaching.deadlineLabel,
    },
  });
}
