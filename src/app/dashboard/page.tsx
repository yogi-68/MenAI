"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquare, Plus, Target } from "lucide-react";
import { LineChartCard } from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { MonthlyReviewPanel, WeeklyReviewPanel } from "@/components/dashboard/goal-review-tabs";
import {
  AnalyticsRow,
  CoachInsightBanner,
  ExecutionPillarsRow,
  GoalOverviewCard,
  HeroMetricsRow,
} from "@/components/dashboard/overview";

interface DashboardPayload {
  hero: {
    executionScore: number;
    tasksCompletedThisWeek: number;
    tasksPlannedThisWeek: number;
    streak: number;
    nextMilestone: { title: string; progress: number; goalTitle: string } | null;
  };
  pillars: {
    planning: number;
    execution: number;
    reflection: number;
    labels: { planning: string; execution: string; reflection: string };
  };
  trend: {
    points: Array<{ date: string; label: string; score: number }>;
    weekDelta: number;
    targetLine: number;
  };
  goals: Array<{
    id: string;
    title: string;
    progress: number;
    targetDate: string | null;
    remainingDays: number | null;
    todayScore: number;
    healthLabel: string;
    currentMilestone: string | null;
    confidenceScore: number | null;
    colorIndex: number;
  }>;
  analyticsRow: {
    planAdherence: number;
    taskOutcomes: { completed: number; skipped: number; missed: number };
    activeTime: Array<{ label: string; value: number }>;
    executionBlockers: Array<{ label: string; count: number }>;
    confidenceTrend: Array<{ label: string; value: number }>;
  };
  coachInsight: string;
  hasGoals: boolean;
}

type OverviewTab = "goals" | "weekly" | "monthly";

function formatHeaderDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DashboardOverview() {
  const supabase = createClient();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [tab, setTab] = useState<OverviewTab>("goals");

  useEffect(() => {
    const checkOnboarding = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace("/login");
        return;
      }
      const { data: progress } = await supabase
        .from("onboarding_progress")
        .select("completed_at")
        .eq("user_id", authUser.id)
        .maybeSingle();
      if (!progress?.completed_at) {
        router.replace("/onboarding");
        return;
      }
      setCheckingOnboarding(false);
    };
    checkOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/dashboard");
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<DashboardPayload>;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  if (checkingOnboarding) {
    return (
      <div className="page-shell flex items-center justify-center min-h-[60vh]">
        <div className="skeleton shimmer" style={{ width: 200, height: 40, borderRadius: 12 }} />
      </div>
    );
  }

  const trendData =
    data?.trend.points.map((p) => ({ label: p.label, value: p.score, date: p.date })) ?? [];

  return (
    <div className="page-shell">
      <header
        className="animate-fade-in mb-6 flex flex-wrap items-center justify-between gap-4"
        style={{ borderBottom: "0.5px solid var(--border-color)", paddingBottom: 16 }}
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight">Overview</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {formatHeaderDate()}
          </span>
          <Link
            href="/dashboard/goals"
            className="btn-primary inline-flex items-center gap-1.5 text-sm no-underline px-3 py-2"
          >
            <Plus size={14} /> Add goal
          </Link>
        </div>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(
          [
            { id: "goals" as const, label: "Goals" },
            { id: "weekly" as const, label: "Weekly review" },
            { id: "monthly" as const, label: "Monthly" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`overview-tab${tab === t.id ? " active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "goals" && (
        <>
          {!isLoading && !data?.hasGoals ? (
            <ClayCard className="p-4" hover={false}>
              <ul className="text-sm m-0 pl-4 space-y-2" style={{ color: "var(--text-secondary)" }}>
                <li>Add an active goal with a deadline (30–90 days)</li>
                <li>Mettle plans 3 coach tasks per goal per day</li>
                <li>Tasks tie to milestones and recent activity</li>
              </ul>
              <div className="flex flex-wrap gap-3 mt-4">
                <Link
                  href="/dashboard/chat"
                  className="btn-primary inline-flex items-center gap-2 text-sm no-underline px-4 py-2"
                >
                  <MessageSquare size={14} /> Talk to your coach
                </Link>
                <Link
                  href="/onboarding"
                  className="btn-secondary inline-flex items-center gap-2 text-sm no-underline px-4 py-2"
                >
                  <Target size={14} /> Set up via onboarding
                </Link>
              </div>
            </ClayCard>
          ) : (
            <div className="flex flex-col gap-4">
              <HeroMetricsRow
                executionScore={data?.hero.executionScore ?? 0}
                tasksCompletedThisWeek={data?.hero.tasksCompletedThisWeek ?? 0}
                tasksPlannedThisWeek={data?.hero.tasksPlannedThisWeek ?? 0}
                streak={data?.hero.streak ?? 0}
                nextMilestone={data?.hero.nextMilestone ?? null}
                loading={isLoading}
              />

              <ExecutionPillarsRow
                planning={data?.pillars.planning ?? 0}
                execution={data?.pillars.execution ?? 0}
                reflection={data?.pillars.reflection ?? 0}
                labels={
                  data?.pillars.labels ?? {
                    planning: "Add deadline + milestones",
                    execution: "Complete daily tasks",
                    reflection: "Log end-of-day reflections",
                  }
                }
                loading={isLoading}
              />

              <div className="grid gap-4 lg:grid-cols-5">
                <ClayCard className="p-4 lg:col-span-3" hover={false}>
                  <LineChartCard
                    title="Score trend"
                    subtitle="30-day execution score"
                    data={trendData}
                    loading={isLoading}
                    height={220}
                    valueFormatter={(v) => `${v}%`}
                    emptyMessage="Complete tasks to build your trend"
                    action={
                      (data?.trend.weekDelta ?? 0) !== 0 ? (
                        <span
                          className="text-xs font-medium"
                          style={{
                            color:
                              (data?.trend.weekDelta ?? 0) >= 0
                                ? "var(--accent-success)"
                                : "var(--accent-danger)",
                          }}
                        >
                          {(data?.trend.weekDelta ?? 0) >= 0 ? "↑" : "↓"}
                          {Math.abs(data?.trend.weekDelta ?? 0)} vs last week
                        </span>
                      ) : undefined
                    }
                  />
                </ClayCard>

                <div className="flex flex-col gap-2 lg:col-span-2">
                  {(data?.goals ?? []).slice(0, 4).map((goal) => (
                    <GoalOverviewCard key={goal.id} goal={goal} />
                  ))}
                  {isLoading &&
                    [1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="skeleton shimmer"
                        style={{ height: 88, borderRadius: "var(--radius-xl)" }}
                      />
                    ))}
                </div>
              </div>

              <AnalyticsRow
                planAdherence={data?.analyticsRow.planAdherence ?? 0}
                taskOutcomes={data?.analyticsRow.taskOutcomes ?? { completed: 0, skipped: 0, missed: 0 }}
                activeTime={data?.analyticsRow.activeTime ?? []}
                executionBlockers={data?.analyticsRow.executionBlockers ?? []}
                confidenceTrend={data?.analyticsRow.confidenceTrend ?? []}
                loading={isLoading}
              />

              {data?.coachInsight && <CoachInsightBanner insight={data.coachInsight} />}
            </div>
          )}
        </>
      )}

      {tab === "weekly" && <WeeklyReviewPanel />}
      {tab === "monthly" && <MonthlyReviewPanel />}
    </div>
  );
}
