import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computePerformanceScore, computeGoalAnalytics } from "@/lib/plans/performance-score";
import { computeGoalHealth } from "@/lib/plans/goal-health";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";
import { lifeAreaLabel } from "@/lib/plans/life-areas";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [performance, goals] = await Promise.all([
    computePerformanceScore(supabase, user.id),
    fetchActiveExecutionGoals(supabase, user.id),
  ]);

  const goalCards = await Promise.all(
    goals.map(async (goal) => {
      const analytics = await computeGoalAnalytics(supabase, user.id, goal.id);
      const scoreEntry = performance.goalScores.find((s) => s.goalId === goal.id);
      const health = computeGoalHealth({
        status: goal.status,
        targetDate: goal.target_date,
        lastActionAt: goal.last_action_at,
        progress: goal.progress ?? 0,
      });

      return {
        id: goal.id,
        title: goal.title,
        progress: goal.progress ?? 0,
        priority: goal.priority ?? "medium",
        status: goal.status,
        lifeArea: goal.life_area,
        targetDate: goal.target_date,
        streak: analytics?.streak ?? 0,
        remainingDays: analytics?.remainingDays ?? null,
        daysCompleted: analytics?.daysCompleted ?? 0,
        todayCompletion: analytics?.todayCompleted ?? scoreEntry?.completed ?? 0,
        todayScore: analytics?.todayScore ?? scoreEntry?.score ?? 0,
        health: health.health,
        healthLabel: health.label,
        sparkline: (analytics?.dailyTrend ?? []).slice(-7).map((d) => d.score),
        currentMilestone: analytics?.currentMilestone ?? null,
      };
    })
  );

  const lifeAreaMap = new Map<string, number>();
  for (const g of goalCards) {
    const key = g.lifeArea || "personal";
    lifeAreaMap.set(key, (lifeAreaMap.get(key) || 0) + 1);
  }

  const charts = {
    trend: performance.trend.map((t) => ({
      date: t.date,
      label: new Date(t.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      score: t.score,
    })),
    goalScores: goalCards.map((g) => ({
      label: g.title.length > 22 ? `${g.title.slice(0, 20)}…` : g.title,
      value: g.todayScore,
      progress: g.progress,
    })),
    lifeAreas: [...lifeAreaMap.entries()].map(([area, count]) => ({
      label: lifeAreaLabel(area),
      value: count,
    })),
    completionSplit: [
      { label: "Completed today", value: performance.daily },
      { label: "Remaining", value: Math.max(0, 100 - performance.daily) },
    ],
    radar: goalCards.slice(0, 5).map((g) => ({
      label: g.title.length > 12 ? `${g.title.slice(0, 10)}…` : g.title,
      value: g.todayScore,
    })),
  };

  return NextResponse.json({
    performance,
    goals: goalCards,
    hasGoals: goalCards.length > 0,
    charts,
  });
}
