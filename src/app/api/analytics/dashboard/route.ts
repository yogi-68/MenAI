/**
 * GET /api/analytics/dashboard — single batched payload for Overview page.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  computePerformanceScore,
  computeGoalAnalytics,
  TASKS_PER_GOAL,
} from "@/lib/plans/performance-score";
import { computeGoalHealth } from "@/lib/plans/goal-health";
import { fetchActiveExecutionGoals } from "@/lib/goals/active-goals";
import { computeExecutionPillars } from "@/lib/analytics/execution-pillars";
import {
  buildCoachInsightQuote,
  fetchNextMilestone,
  fetchAnalyticsRowData,
} from "@/lib/analytics/dashboard-insights";
import { getUserContext } from "@/lib/context/user-context";
import { getUserModel } from "@/lib/user-model/loader";

export const runtime = "nodejs";

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [performance, goals, pillars, userContext, userModel, nextMilestone] =
    await Promise.all([
      computePerformanceScore(supabase, user.id),
      fetchActiveExecutionGoals(supabase, user.id, 12),
      computeExecutionPillars(supabase, user.id),
      getUserContext(supabase, user.id),
      getUserModel(supabase, user.id),
      fetchNextMilestone(supabase, user.id),
    ]);

  const analyticsRow = await fetchAnalyticsRowData(supabase, user.id, performance);

  const goalCount = Math.max(1, goals.length);
  const tasksPlannedThisWeek = goalCount * TASKS_PER_GOAL * 7;
  const tasksCompletedThisWeek = performance.trend
    .slice(-7)
    .reduce((sum, d) => sum + Math.round((d.score / 100) * TASKS_PER_GOAL * goalCount), 0);

  const goalCards = await Promise.all(
    goals.map(async (goal, index) => {
      const analytics = await computeGoalAnalytics(supabase, user.id, goal.id);
      const scoreEntry = performance.goalScores.find((s) => s.goalId === goal.id);
      const health = computeGoalHealth({
        status: goal.status,
        targetDate: goal.target_date,
        lastActionAt: goal.last_action_at,
        progress: goal.progress ?? 0,
      });
      const confidence = userModel.goalConfidence?.[goal.id]?.total ?? null;

      return {
        id: goal.id,
        title: goal.title,
        progress: goal.progress ?? 0,
        targetDate: goal.target_date,
        remainingDays: goal.target_date ? daysUntil(goal.target_date) : null,
        todayScore: analytics?.todayScore ?? scoreEntry?.score ?? 0,
        health: health.health,
        healthLabel: health.label,
        currentMilestone: analytics?.currentMilestone ?? null,
        confidenceScore: confidence,
        colorIndex: index,
      };
    })
  );

  const primaryGoal = goals[0];
  const coachInsight = buildCoachInsightQuote({
    performance,
    pillars,
    lastAchievement: userContext.lastAchievement,
    tasksCompletedToday: userContext.todayPlan.filter((t) => t.status === "completed").length,
    tasksDueToday: userContext.todayPlan.length,
    primaryGoalTitle: primaryGoal?.title ?? null,
    daysRemaining: primaryGoal?.target_date ? daysUntil(primaryGoal.target_date) : null,
  });

  const trend = performance.trend.map((t) => ({
    date: t.date,
    label: new Date(t.date + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    score: t.score,
  }));

  return NextResponse.json({
    hero: {
      executionScore: pillars.overall,
      tasksCompletedThisWeek,
      tasksPlannedThisWeek,
      streak: performance.streak,
      nextMilestone,
    },
    pillars: {
      planning: pillars.planning,
      execution: pillars.execution,
      reflection: pillars.reflection,
      labels: pillars.labels,
    },
    trend: {
      points: trend,
      weekDelta: performance.weekDelta,
      targetLine: 70,
    },
    goals: goalCards,
    analyticsRow,
    coachInsight,
    performance: {
      daily: performance.daily,
      weekly: performance.weekly,
      completionPct: performance.completionPct,
    },
    hasGoals: goalCards.length > 0,
  });
}
