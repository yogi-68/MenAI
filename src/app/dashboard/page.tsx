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
  const user = useAppStore((s) => s.user);
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
  const weeklyTrend = (data?.charts?.trend ?? []).slice(-7).map((t) => ({
    label: t.label,
    value: t.score,
    fill: dailyScoreBarColor(t.score),
  }));

  return (
    <div className="page-shell">
      <header
        className="animate-fade-in mb-6 flex flex-wrap items-center justify-between gap-4"
        style={{ borderBottom: "0.5px solid rgba(255,255,255,0.07)", paddingBottom: 16 }}
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
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton shimmer" style={{ height: 160, borderRadius: "var(--radius-md)" }} />
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
              {goals.map((goal, index) => (
                <Link key={goal.id} href={`/dashboard/goals/${goal.id}`} className="no-underline block">
                  <ClayCard className="p-5 h-full" hover>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <h3
                        className="leading-snug m-0"
                        style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)" }}
                      >
                        {goal.title}
                      </h3>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          color: goalAccent(index),
                          background: "var(--bg-glass)",
                          border: "0.5px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        Active
                      </span>
                    </div>

                    <div
                      className="h-1.5 rounded-full mb-3 overflow-hidden"
                      style={{ background: "rgba(124, 111, 255, 0.12)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, goal.progress)}%`, background: goalAccent(index) }}
                      />
                    </div>

                    <div className="flex justify-between items-center">
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: goalAccent(index) }}>
                        {goal.progress}% complete
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color:
                            goal.remainingDays != null && goal.remainingDays < 7
                              ? "#f87171"
                              : "var(--text-muted)",
                        }}
                      >
                        {goal.remainingDays != null ? (
                          <>{goal.remainingDays} days left</>
                        ) : (
                          <span style={{ color: "#f59e0b" }}>Add a deadline to unlock planning</span>
                        )}
                      </span>
                    </div>
                  </ClayCard>
                </Link>
              ))}

              <ClayCard className="p-5 h-full" hover={false}>
                <h3 className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  Performance this week
                </h3>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                  Daily score — last 7 days
                </p>
                <BarChartCard
                  title=""
                  subtitle=""
                  data={weeklyTrend}
                  loading={isLoading}
                  valueFormatter={(v) => `${v}%`}
                  hideHeader
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
