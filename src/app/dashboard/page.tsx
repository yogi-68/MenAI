"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquare, Plus, Target } from "lucide-react";
import { BarChartCard } from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { MonthlyReviewPanel, WeeklyReviewPanel } from "@/components/dashboard/goal-review-tabs";
import { goalAccent } from "@/lib/goals/goal-colors";
import { dailyScoreBarColor } from "@/components/charts/chart-theme";

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
  health: string;
  healthLabel: string;
  sparkline: number[];
  currentMilestone: string | null;
}

interface OverviewCharts {
  trend: Array<{ date: string; label: string; score: number }>;
}

interface OverviewPayload {
  performance: {
    weekly: number;
    daily: number;
    monthAvg?: number;
    monthly: number;
    streak: number;
    completionPct: number;
    weekAvg?: number;
    prevWeekAvg?: number;
    weekDelta?: number;
    trend: Array<{ date: string; score: number }>;
  };
  goals: GoalCard[];
  hasGoals: boolean;
  charts: OverviewCharts;
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

function statusBadge(status: string): { label: string; color: string; bg: string } {
  if (status === "paused") {
    return { label: "Paused", color: "var(--accent-warning)", bg: "rgba(245, 158, 11, 0.12)" };
  }
  if (status === "completed") {
    return { label: "Completed", color: "var(--accent-primary)", bg: "rgba(124, 111, 255, 0.12)" };
  }
  return { label: "Active", color: "var(--accent-success)", bg: "rgba(29, 158, 117, 0.12)" };
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

  const goals = data?.goals?.slice(0, 3) ?? [];
  const weekAvg = data?.performance?.weekAvg ?? data?.performance?.weekly ?? 0;
  const weekDelta = data?.performance?.weekDelta ?? 0;
  const weeklyTrend = (data?.charts?.trend ?? []).slice(-7).map((t) => ({
    label: t.label,
    value: t.score,
    fill: dailyScoreBarColor(t.score),
  }));

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
          {isLoading ? (
            <div className="grid gap-2.5 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton shimmer" style={{ height: 160, borderRadius: "var(--radius-xl)" }} />
              ))}
            </div>
          ) : !data?.hasGoals ? (
            <ClayCard className="p-4" hover={false}>
              <ul className="text-sm m-0 pl-4 space-y-2" style={{ color: "var(--text-secondary)" }}>
                <li>Add an active goal with a deadline (30–90 days)</li>
                <li>MenAI plans 3 coach tasks per goal per day</li>
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
            <div className="grid gap-2.5 md:grid-cols-2">
              {goals.map((goal, index) => {
                const accent = goalAccent(index);
                const badge = statusBadge(goal.status);
                return (
                  <Link key={goal.id} href={`/dashboard/goals/${goal.id}`} className="no-underline block">
                    <ClayCard className="p-4 h-full gap-2.5" hover>
                      <div className="flex justify-between items-start gap-2">
                        <h3
                          className="leading-snug m-0 truncate flex-1"
                          style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}
                        >
                          {goal.title}
                        </h3>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            color: badge.color,
                            background: badge.bg,
                            border: "0.5px solid var(--border-color)",
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div
                        className="rounded-full overflow-hidden"
                        style={{ height: 3, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, goal.progress)}%`, background: accent }}
                        />
                      </div>

                      <div className="flex justify-between items-center gap-2 text-xs">
                        <span style={{ fontWeight: 500, color: accent }}>
                          {goal.progress}% complete
                        </span>
                        {goal.remainingDays != null ? (
                          <span style={{ color: "var(--text-muted)" }}>
                            {goal.remainingDays} days left
                          </span>
                        ) : (
                          <span style={{ color: "var(--accent-warning)" }}>Add deadline →</span>
                        )}
                      </div>

                      <div
                        className="flex justify-between items-center gap-2 pt-1 text-[11px]"
                        style={{ color: "var(--text-muted)", borderTop: "0.5px solid var(--border-subtle)" }}
                      >
                        <span>Goal score: {goal.todayScore}</span>
                        <span className="truncate max-w-[55%] text-right">
                          {goal.currentMilestone ?? "No milestone yet"}
                        </span>
                      </div>
                    </ClayCard>
                  </Link>
                );
              })}

              <ClayCard className="p-4 h-full gap-2.5" hover={false}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="text-sm font-medium m-0 mb-0.5" style={{ color: "var(--text-primary)" }}>
                      Performance this week
                    </h3>
                    <p className="text-[11px] m-0" style={{ color: "var(--text-muted)" }}>
                      Daily score — last 7 days
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                      Avg: {weekAvg > 0 ? weekAvg : "—"}
                    </div>
                    {weekDelta !== 0 && (
                      <div
                        className="text-[11px]"
                        style={{
                          color: weekDelta >= 0 ? "var(--accent-success)" : "var(--accent-danger)",
                        }}
                      >
                        {weekDelta >= 0 ? "↑" : "↓"}
                        {Math.abs(weekDelta)} vs last week
                      </div>
                    )}
                  </div>
                </div>
                <BarChartCard
                  title=""
                  subtitle=""
                  data={weeklyTrend}
                  loading={isLoading}
                  valueFormatter={(v) => `${v}%`}
                  hideHeader
                  emptyMessage="Complete tasks to build your history"
                />
              </ClayCard>
            </div>
          )}
        </>
      )}

      {tab === "weekly" && <WeeklyReviewPanel />}
      {tab === "monthly" && <MonthlyReviewPanel />}
    </div>
  );
}
