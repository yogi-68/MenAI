import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computePerformanceScore } from "@/lib/plans/performance-score";
import { fetchExecutionMetrics } from "@/lib/plans/execution-rate";
import { computeMomentumScore } from "@/lib/plans/momentum-score";

export const runtime = "nodejs";

type Range = "7d" | "30d" | "90d";

function parseRange(value: string | null): Range {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return "30d";
}

function rangeDays(range: Range): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = parseRange(new URL(req.url).searchParams.get("range"));
  const days = rangeDays(range);

  const [performance, execution, momentum] = await Promise.all([
    computePerformanceScore(supabase, user.id),
    fetchExecutionMetrics(supabase, user.id),
    computeMomentumScore(supabase, user.id),
  ]);

  const trend = performance.trend.slice(-days).map((row) => ({
    date: row.date,
    label: formatLabel(row.date),
    value: row.score,
  }));

  const goalBreakdown = performance.goalScores.map((g) => ({
    label: g.title.length > 20 ? g.title.slice(0, 18) + "…" : g.title,
    value: g.score,
    goalId: g.goalId,
    completed: g.completed,
    planned: g.planned,
  }));

  const executionSnapshot =
    range === "7d"
      ? execution.last7Days
      : range === "30d"
        ? execution.last30Days
        : execution.last30Days;

  return NextResponse.json({
    range,
    summary: {
      daily: performance.daily,
      weekly: performance.weekly,
      monthly: performance.monthly,
      average: performance.average,
      successRate: performance.successRate,
      completionPct: performance.completionPct,
      streak: performance.streak,
      missedDays: performance.missedDays,
      momentumScore: momentum.score,
      executionRate: executionSnapshot.rate,
      executionCompleted: executionSnapshot.completed,
      executionTotal: executionSnapshot.total,
    },
    trend,
    goalBreakdown,
    lifeAreaBreakdown: execution.byLifeArea.map((a) => ({
      label: a.label,
      value: a.rate,
      completed: a.completed,
      total: a.total,
    })),
    initiativeBreakdown: execution.byInitiative.map((i) => ({
      label: i.title.length > 24 ? i.title.slice(0, 22) + "…" : i.title,
      value: i.rate,
      initiativeId: i.initiativeId,
      lifeArea: i.lifeArea,
    })),
  });
}
