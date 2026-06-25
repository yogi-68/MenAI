import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computePerformanceScore, computeGoalAnalytics } from "@/lib/plans/performance-score";
import { computeGoalHealth } from "@/lib/plans/goal-health";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [performance, goalsRes] = await Promise.all([
    computePerformanceScore(supabase, user.id),
    supabase
      .from("goals")
      .select("id, title, progress, priority, status, target_date, life_area, last_action_at")
      .eq("user_id", user.id)
      .eq("goal_kind", "execution")
      .eq("status", "active")
      .order("last_action_at", { ascending: false, nullsFirst: false })
      .limit(12),
  ]);

  const goals = goalsRes.data || [];

  const goalCards = await Promise.all(
    goals.map(async (goal) => {
      const analytics = await computeGoalAnalytics(supabase, user.id, goal.id);
      const scoreEntry = performance.goalScores.find((s) => s.goalId === goal.id);
      const health = computeGoalHealth({
        status: goal.status,
        targetDate: goal.target_date,
        lastActionAt: goal.last_action_at,
        progress: goal.progress,
      });

      return {
        id: goal.id,
        title: goal.title,
        progress: goal.progress ?? 0,
        priority: goal.priority ?? "medium",
        status: goal.status,
        lifeArea: goal.life_area,
        streak: analytics?.streak ?? 0,
        remainingDays: analytics?.remainingDays ?? null,
        daysCompleted: analytics?.daysCompleted ?? 0,
        todayCompletion: analytics?.todayCompleted ?? scoreEntry?.completed ?? 0,
        todayScore: analytics?.todayScore ?? scoreEntry?.score ?? 0,
        health: health.health,
        healthLabel: health.label,
      };
    })
  );

  return NextResponse.json({
    performance,
    goals: goalCards,
    hasGoals: goalCards.length > 0,
  });
}
