"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Flame, Calendar, Target, MessageSquare } from "lucide-react";
import {
  AreaChartCard,
  LineChartCard,
  BarChartCard,
  PieChartCard,
  DonutChartCard,
  RadarChartCard,
  RadialProgressChart,
} from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { GoalReviewTabs } from "@/components/dashboard/goal-review-tabs";
import { healthColor } from "@/lib/plans/goal-health";
import type { GoalHealth } from "@/lib/plans/goal-health";

interface GoalCard {
  id: string;
  title: string;
  progress: number;
  priority: string;
  status: string;
  lifeArea: string;
  targetDate: string | null;
  streak: number;
  remainingDays: number | null;
  daysCompleted: number;
  todayCompletion: number;
  todayScore: number;
  health: GoalHealth;
  healthLabel: string;
  sparkline: number[];
}

interface OverviewCharts {
  trend: Array<{ date: string; label: string; score: number }>;
  goalScores: Array<{ label: string; value: number; progress: number }>;
  lifeAreas: Array<{ label: string; value: number }>;
  completionSplit: Array<{ label: string; value: number }>;
  radar: Array<{ label: string; value: number }>;
}

interface OverviewPayload {
  performance: {
    weekly: number;
    daily: number;
    monthly: number;
    streak: number;
    completionPct: number;
    trend: Array<{ date: string; score: number }>;
  };
  goals: GoalCard[];
  hasGoals: boolean;
  charts: OverviewCharts;
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f59e0b";
    case "low":
      return "var(--text-muted)";
    default:
      return "var(--accent-primary)";
  }
}

export default function DashboardOverview() {
  const user = useAppStore((s) => s.user);
  const supabase = createClient();
  const router = useRouter();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

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
    queryKey: ["analytics-overview"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/overview");
      if (!res.ok) throw new Error("Failed to load");
      return res.json() as Promise<OverviewPayload>;
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

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const charts = data?.charts;
  const trendLine = (charts?.trend ?? []).map((t) => ({ label: t.label, value: t.score }));
  const trendArea = trendLine;

  return (
    <div className="page-shell">
      <header className="animate-fade-in mb-8">
        <p className="clay-label mb-2">Overview</p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          {firstName}&apos;s execution
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Goals, performance score, and reviews — tap any goal for deep analytics
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <RadialProgressChart
          title="This week"
          subtitle="Performance"
          value={data?.performance.weekly ?? 0}
          loading={isLoading}
          label="Weekly"
        />
        <RadialProgressChart
          title="This month"
          subtitle="Performance"
          value={data?.performance.monthly ?? 0}
          loading={isLoading}
          label="Monthly"
        />
        <ClayCard className="p-5 flex flex-col justify-center gap-3" hover={false}>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <Flame size={16} style={{ color: "var(--accent-primary)" }} />
            <span>
              <strong style={{ color: "var(--text-primary)" }}>{data?.performance.streak ?? 0}</strong> day streak
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <Target size={16} style={{ color: "var(--accent-primary)" }} />
            <span>
              <strong style={{ color: "var(--text-primary)" }}>{data?.performance.completionPct ?? 0}%</strong> task completion
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <Calendar size={16} style={{ color: "var(--accent-primary)" }} />
            <span>
              Score formula: <strong style={{ color: "var(--text-primary)" }}>3 tasks/goal/day = 100</strong>
            </span>
          </div>
        </ClayCard>
      </div>

      <section className="mb-8">
        <h2 className="clay-label mb-4">Analytics</h2>
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <AreaChartCard
              title="Performance trend"
              subtitle="14-day area chart"
              data={trendArea}
              loading={isLoading}
              valueFormatter={(v) => `${v}%`}
            />
          </div>
          <LineChartCard
            title="Daily scores"
            subtitle="Line chart"
            data={trendLine}
            loading={isLoading}
            valueFormatter={(v) => `${v}%`}
          />
          <BarChartCard
            title="Score by goal"
            subtitle="Today"
            data={(charts?.goalScores ?? []).map((g) => ({ label: g.label, value: g.value }))}
            loading={isLoading}
            valueFormatter={(v) => `${v}%`}
          />
          <PieChartCard
            title="Life areas"
            subtitle="Active goals"
            data={charts?.lifeAreas ?? []}
            loading={isLoading}
          />
          <DonutChartCard
            title="Today completion"
            subtitle="Daily split"
            data={charts?.completionSplit ?? []}
            loading={isLoading}
          />
          <RadarChartCard
            title="Goal balance"
            subtitle="Today's scores"
            data={charts?.radar ?? []}
            loading={isLoading}
          />
        </div>
      </section>

      <section className="mb-4">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="clay-label">Your goals</h2>
          <Link
            href="/dashboard/plans"
            className="text-sm inline-flex items-center gap-1 no-underline"
            style={{ color: "var(--accent-primary)" }}
          >
            Today&apos;s plan <ArrowRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton shimmer" style={{ height: 180, borderRadius: "var(--radius-md)" }} />
            ))}
          </div>
        ) : !data?.hasGoals ? (
          <ClayCard className="p-6" hover={false}>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
              Add an active goal with a deadline (30–90 days). MenAI plans{" "}
              <strong style={{ color: "var(--text-primary)" }}>3 coach tasks per goal per day</strong> tied to
              milestones and your recent activity.
            </p>
            <div className="flex flex-wrap gap-3">
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
          <div className="grid gap-4 md:grid-cols-2">
            {data.goals.map((goal) => (
              <Link
                key={goal.id}
                href={`/dashboard/goals/${goal.id}`}
                className="no-underline block"
              >
                <ClayCard className="p-5 h-full" hover>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <h3 className="text-base font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                      {goal.title}
                    </h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        color: healthColor(goal.health),
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      {goal.healthLabel}
                    </span>
                  </div>

                  <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: "var(--bg-glass)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, goal.progress)}%`, background: "var(--gradient-primary)" }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                    <span>
                      Progress: <strong style={{ color: "var(--text-primary)" }}>{goal.progress}%</strong>
                    </span>
                    <span>
                      Priority:{" "}
                      <strong style={{ color: priorityColor(goal.priority) }}>{goal.priority}</strong>
                    </span>
                    <span>
                      Streak: <strong style={{ color: "var(--text-primary)" }}>{goal.streak}d</strong>
                    </span>
                    <span>
                      Remaining:{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {goal.remainingDays != null ? `${goal.remainingDays}d` : "—"}
                      </strong>
                    </span>
                    <span>
                      Days done: <strong style={{ color: "var(--text-primary)" }}>{goal.daysCompleted}</strong>
                    </span>
                    <span>
                      Today:{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {goal.todayCompletion}/3 · {goal.todayScore}%
                      </strong>
                    </span>
                  </div>

                  {goal.sparkline.length > 0 && (
                    <div className="h-10 flex items-end gap-0.5">
                      {goal.sparkline.map((s, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm"
                          style={{
                            height: `${Math.max(8, s)}%`,
                            background: "var(--gradient-primary)",
                            opacity: 0.35 + (s / 100) * 0.65,
                          }}
                        />
                      ))}
                    </div>
                  )}

                  <div className="mt-4 text-xs inline-flex items-center gap-1" style={{ color: "var(--accent-primary)" }}>
                    Open analytics <ArrowRight size={12} />
                  </div>
                </ClayCard>
              </Link>
            ))}
          </div>
        )}
      </section>

      <GoalReviewTabs />
    </div>
  );
}
