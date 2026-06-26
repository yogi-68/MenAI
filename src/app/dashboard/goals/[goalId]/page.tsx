"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Sparkles, Flame, Calendar, Target } from "lucide-react";
import {
  LineChartCard,
  AreaChartCard,
  BarChartCard,
  RadialProgressChart,
} from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { healthColor } from "@/lib/plans/goal-health";
import type { GoalHealth } from "@/lib/plans/goal-health";

interface GoalAnalyticsPayload {
  goal: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    progress: number;
    target_date: string | null;
    life_area: string;
  };
  milestones: Array<{ id: string; title: string; status: string }>;
  dailyTrend: Array<{ date: string; score: number; completed: number }>;
  weeklyTrend: Array<{ week: string; score: number }>;
  monthlyTrend: Array<{ month: string; score: number }>;
  streak: number;
  missedDays: string[];
  remainingDays: number | null;
  daysCompleted: number;
  progress: number;
  estimatedCompletionDate: string | null;
  successProbability: number;
  tasksCompletedTotal: number;
  dailyProgressNeeded: number | null;
  todayScore: number;
  todayCompleted: number;
  health: { health: GoalHealth; label: string; reason: string };
  coaching: {
    headline: string;
    coachInsight: string;
    knownFacts: string[];
    onceKnown: string[];
    daysRemaining: number | null;
    deadlineLabel: string | null;
  };
}

function MetricPill({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: string }) {
  return (
    <ClayCard className="p-4 flex items-center gap-3" hover={false}>
      <div
        className="clay-card-inset flex items-center justify-center"
        style={{ width: 36, height: 36, borderRadius: "50%" }}
      >
        <Icon size={16} style={{ color: "var(--accent-primary)" }} />
      </div>
      <div>
        <div className="text-xs clay-label">{label}</div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {value}
        </div>
      </div>
    </ClayCard>
  );
}

export default function GoalDetailPage() {
  const params = useParams();
  const goalId = params.goalId as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics-goal", goalId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/goals/${goalId}`);
      if (!res.ok) throw new Error("Goal not found");
      return res.json() as Promise<GoalAnalyticsPayload>;
    },
    enabled: Boolean(goalId),
  });

  if (error) {
    return (
      <div className="page-shell">
        <p style={{ color: "var(--text-muted)" }}>Goal not found.</p>
        <Link href="/dashboard" style={{ color: "var(--accent-primary)" }}>
          Back to overview
        </Link>
      </div>
    );
  }

  const dailyChart = (data?.dailyTrend ?? []).map((d) => ({
    label: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: d.score,
  }));

  const weeklyChart = (data?.weeklyTrend ?? []).map((w) => ({
    label: w.week.replace("-W", " W"),
    value: w.score,
  }));

  const monthlyChart = (data?.monthlyTrend ?? []).map((m) => ({
    label: m.month,
    value: m.score,
  }));

  return (
    <div className="page-shell">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm mb-4"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          <ArrowLeft size={14} /> Overview
        </Link>
        {isLoading ? (
          <div className="skeleton shimmer" style={{ height: 40, width: 280, borderRadius: 8 }} />
        ) : (
          <>
            <p className="clay-label mb-2">Goal analytics</p>
            <h1 className="text-2xl md:text-3xl font-medium tracking-tight">{data?.goal.title}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: "var(--bg-glass)",
                  color: healthColor(data?.health.health ?? "on_track"),
                  border: "1px solid var(--border-color)",
                }}
              >
                {data?.health.label}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full clay-card-inset" style={{ color: "var(--text-muted)" }}>
                {data?.goal.priority} priority
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full clay-card-inset" style={{ color: "var(--text-muted)" }}>
                {data?.goal.status}
              </span>
            </div>
          </>
        )}
      </header>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-8">
        <MetricPill icon={Target} label="Progress" value={`${data?.progress ?? 0}%`} />
        <MetricPill icon={Flame} label="Streak" value={`${data?.streak ?? 0} days`} />
        <MetricPill icon={Calendar} label="Remaining" value={data?.remainingDays != null ? `${data.remainingDays}d` : "—"} />
        <MetricPill icon={Sparkles} label="Today" value={`${data?.todayCompleted ?? 0}/3 tasks`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        {(data?.tasksCompletedTotal ?? 0) > 0 ? (
          <RadialProgressChart
            title="Success probability"
            subtitle="Forecast"
            value={data?.successProbability ?? 0}
            loading={isLoading}
            label="Likelihood"
          />
        ) : (
          <ClayCard className="p-5 md:p-6 flex flex-col justify-center" hover={false}>
            <h3 className="text-base font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              Success probability
            </h3>
            <p className="text-sm m-0" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
              Complete some tasks to see your forecast.
            </p>
          </ClayCard>
        )}
        <div className="lg:col-span-2">
          <AreaChartCard
            title="Daily performance"
            subtitle="Last 30 days"
            data={dailyChart}
            loading={isLoading}
            valueFormatter={(v) => `${v}%`}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <LineChartCard
          title="Weekly trend"
          subtitle="Goal analytics"
          data={weeklyChart}
          loading={isLoading}
          valueFormatter={(v) => `${v}%`}
        />
        <BarChartCard
          title="Monthly trend"
          subtitle="Goal analytics"
          data={monthlyChart}
          loading={isLoading}
          valueFormatter={(v) => `${v}%`}
        />
      </div>

      <section className="grid gap-6 lg:grid-cols-2 mb-8">
        <ClayCard className="p-5 md:p-6" hover={false}>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} style={{ color: "var(--accent-primary)" }} />
            <h3 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
              AI coaching insights
            </h3>
          </div>
          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: 120, borderRadius: "var(--radius-md)" }} />
          ) : (
            <>
              <p className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                {data?.coaching.headline}
              </p>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                {data?.coaching.coachInsight}
              </p>
              {(data?.coaching.knownFacts?.length ?? 0) > 0 && (
                <div className="mb-3">
                  <div className="clay-label mb-2">What we know</div>
                  <ul className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
                    {data?.coaching.knownFacts.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(data?.coaching.onceKnown?.length ?? 0) > 0 && (
                <div>
                  <div className="clay-label mb-2">Once clarified</div>
                  <ul className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
                    {data?.coaching.onceKnown.map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </ClayCard>

        <ClayCard className="p-5 md:p-6" hover={false}>
          <div className="clay-label mb-2">Details</div>
          <h3 className="text-base font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Execution summary
          </h3>
          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ) : (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Days completed (66%+)</dt>
                <dd style={{ color: "var(--text-primary)" }}>{data?.daysCompleted}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Today score</dt>
                <dd style={{ color: "var(--text-primary)" }}>{data?.todayScore}%</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Daily progress needed</dt>
                <dd style={{ color: "var(--text-primary)" }}>
                  {data?.dailyProgressNeeded != null ? `${data.dailyProgressNeeded.toFixed(1)}%/day` : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Est. completion</dt>
                <dd style={{ color: "var(--text-primary)" }}>{data?.estimatedCompletionDate ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>Health</dt>
                <dd style={{ color: healthColor(data?.health.health ?? "on_track") }}>{data?.health.reason}</dd>
              </div>
            </dl>
          )}
        </ClayCard>
      </section>

      {(data?.milestones ?? []).length > 0 && (
        <ClayCard className="p-5 md:p-6" hover={false}>
          <div className="clay-label mb-2">Milestones</div>
          <ul className="space-y-2">
            {data?.milestones.map((m) => (
              <li
                key={m.id}
                className="flex justify-between text-sm py-2 border-b last:border-0"
                style={{ borderColor: "var(--border-color)", color: "var(--text-primary)" }}
              >
                <span>{m.title}</span>
                <span style={{ color: "var(--text-muted)" }}>{m.status}</span>
              </li>
            ))}
          </ul>
        </ClayCard>
      )}
    </div>
  );
}
