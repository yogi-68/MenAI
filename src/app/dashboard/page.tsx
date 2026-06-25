"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Flame,
  Calendar,
  Target,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { LineChartCard, RadialProgressChart } from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { healthColor } from "@/lib/plans/goal-health";
import type { GoalHealth } from "@/lib/plans/goal-health";

interface GoalCard {
  id: string;
  title: string;
  progress: number;
  priority: string;
  status: string;
  lifeArea: string;
  streak: number;
  remainingDays: number | null;
  daysCompleted: number;
  todayCompletion: number;
  todayScore: number;
  health: GoalHealth;
  healthLabel: string;
}

interface OverviewPayload {
  performance: {
    weekly: number;
    daily: number;
    streak: number;
    completionPct: number;
    trend: Array<{ date: string; score: number }>;
  };
  goals: GoalCard[];
  hasGoals: boolean;
}

function formatTrend(trend: Array<{ date: string; score: number }>) {
  return trend.map((t) => ({
    label: new Date(t.date + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    value: t.score,
  }));
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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="skeleton shimmer" style={{ width: 200, height: 40, borderRadius: 8 }} />
      </div>
    );
  }

  const firstName = user?.full_name?.split(" ")[0] || "there";
  const trendData = formatTrend(data?.performance.trend ?? []);

  return (
    <div className="page-shell">
      <header className="animate-fade-in mb-8">
        <p
          style={{
            color: "var(--accent-primary)",
            fontSize: "0.75rem",
            marginBottom: "8px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            fontWeight: 700,
          }}
        >
          Overview
        </p>
        <h1
          suppressHydrationWarning
          style={{
            fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
            fontWeight: 600,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
          }}
        >
          {firstName}&apos;s execution
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Performance at a glance — tap a goal for full analytics
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <RadialProgressChart
          title="Weekly performance"
          subtitle="Overview"
          value={data?.performance.weekly ?? 0}
          loading={isLoading}
          label="Weekly"
        />
        <div className="lg:col-span-2">
          <LineChartCard
            title="Weekly trend"
            subtitle="Overview"
            data={trendData}
            loading={isLoading}
            valueFormatter={(v) => `${v}%`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <ClayCard className="px-4 py-3 flex items-center gap-2" hover={false}>
          <Flame size={14} style={{ color: "var(--accent-primary)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{data?.performance.streak ?? 0}</strong> day streak
          </span>
        </ClayCard>
        <ClayCard className="px-4 py-3 flex items-center gap-2" hover={false}>
          <Target size={14} style={{ color: "var(--accent-primary)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{data?.performance.completionPct ?? 0}%</strong> completion
          </span>
        </ClayCard>
        <ClayCard className="px-4 py-3 flex items-center gap-2" hover={false}>
          <Calendar size={14} style={{ color: "var(--accent-primary)" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Today: <strong style={{ color: "var(--text-primary)" }}>{data?.performance.daily ?? 0}%</strong>
          </span>
        </ClayCard>
      </div>

      <section className="mb-8">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <h2 className="text-sm uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Active goals
          </h2>
          <div className="flex gap-3">
            <Link
              href="/dashboard/reviews/weekly"
              className="text-sm inline-flex items-center gap-1"
              style={{ color: "var(--accent-primary)", textDecoration: "none" }}
            >
              <BarChart3 size={14} /> Weekly review
            </Link>
            <Link
              href="/dashboard/plans"
              className="text-sm"
              style={{ color: "var(--text-muted)", textDecoration: "none" }}
            >
              Today&apos;s plan →
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className="skeleton shimmer" style={{ height: 140, borderRadius: "var(--radius-md)" }} />
            ))}
          </div>
        ) : !data?.hasGoals ? (
          <ClayCard className="p-6" hover={false}>
            <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>
              Add an active goal with a deadline to start tracking execution analytics.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/chat"
                className="btn-primary inline-flex items-center gap-2 text-sm no-underline px-4 py-2"
              >
                <MessageSquare size={14} /> Tell MenAI your goal
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
                style={{ textDecoration: "none" }}
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

                  <div
                    className="h-1.5 rounded-full mb-4 overflow-hidden"
                    style={{ background: "var(--bg-glass)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, goal.progress)}%`,
                        background: "var(--gradient-primary)",
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs" style={{ color: "var(--text-muted)" }}>
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
                      Status: <strong style={{ color: "var(--text-primary)" }}>{goal.status}</strong>
                    </span>
                    <span className="col-span-2">
                      Today:{" "}
                      <strong style={{ color: "var(--text-primary)" }}>
                        {goal.todayCompletion}/3 tasks · {goal.todayScore}%
                      </strong>
                    </span>
                  </div>

                  <div
                    className="mt-4 text-xs inline-flex items-center gap-1"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    View analytics <ArrowRight size={12} />
                  </div>
                </ClayCard>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-4 pt-2">
        <Link
          href="/dashboard/reviews/monthly"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          Monthly review <ArrowRight size={14} />
        </Link>
        <Link
          href="/dashboard/chat"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--text-secondary)",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          <MessageSquare size={14} /> Intelligence
        </Link>
      </div>
    </div>
  );
}
