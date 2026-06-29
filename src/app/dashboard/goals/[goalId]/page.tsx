"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import {
  LineChartCard,
  BarChartCard,
  CompletionHeatmap,
  RadialProgressChart,
  GhostRadial,
} from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { MilestoneRoadmap } from "@/components/goals/milestone-roadmap";
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
  milestones: Array<{ id: string; title: string; status: string; completed_at?: string | null }>;
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
  paceInsight?: string;
  coaching: {
    headline: string;
    coachInsight: string;
    knownFacts: string[];
    onceKnown: string[];
    daysRemaining: number | null;
    deadlineLabel: string | null;
  };
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <ClayCard className="p-4 flex flex-col items-start gap-1" hover={false}>
      <div
        className="font-data"
        data-numeric
        style={{ fontSize: "1.75rem", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.1 }}
      >
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </ClayCard>
  );
}

function filterInternalLabels(text: string): boolean {
  return !/^initiative:/i.test(text.trim());
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

  const { data: confidenceData } = useQuery({
    queryKey: ["goal-confidence", goalId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/confidence?goalId=${goalId}`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        confidence: {
          total: number;
          deadline: number;
          obstacle: number;
          success: number;
          resources: number;
          history: number;
          labels: { deadline: string; obstacle: string; success: string; resources: string; history: string };
          missingFactors: Array<{ factor: string; question: string; impact: number }>;
        };
      }>;
    },
    enabled: Boolean(goalId),
    staleTime: 5 * 60_000,
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
    date: d.date,
  }));

  const milestoneRefs = (data?.milestones ?? [])
    .filter((m) => m.status === "completed" && m.completed_at)
    .map((m) => ({
      at: String(m.completed_at).split("T")[0],
      label: m.title.length > 14 ? `${m.title.slice(0, 12)}…` : m.title,
    }));

  const monthlyChart = (data?.monthlyTrend ?? []).map((m) => ({
    label: m.month,
    value: m.score,
  }));

  const streakLabel =
    (data?.streak ?? 0) === 0 ? "Day 1 — start your streak" : `${data?.streak} days`;

  const coachingBullets = [
    ...(data?.coaching.knownFacts ?? []).filter(filterInternalLabels),
    ...(data?.coaching.onceKnown ?? []).filter(filterInternalLabels),
  ].filter(Boolean) as string[];

  const paceInsight = data?.paceInsight || data?.coaching.coachInsight;
  const hasHeatmapData = (data?.dailyTrend ?? []).some((d) => d.completed > 0);
  const hasMonthlyData = monthlyChart.some((m) => m.value > 0);

  return (
    <div className="page-shell">
      <header className="mb-6">
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
            <h1 className="font-display text-2xl font-semibold tracking-tight">{data?.goal.title}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              <span
                className="text-xs px-2.5 py-1 rounded-full"
                style={{
                  background: "var(--bg-glass)",
                  color: healthColor(data?.health.health ?? "on_track"),
                  border: "0.5px solid var(--border-color)",
                }}
              >
                {data?.health.label}
              </span>
            </div>
          </>
        )}
      </header>

      <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4 mb-6">
        <MetricCard label="Progress" value={`${data?.progress ?? 0}%`} />
        <MetricCard label="Streak" value={streakLabel} />
        <MetricCard
          label="Days remaining"
          value={data?.remainingDays != null ? `${data.remainingDays}` : "—"}
        />
        <MetricCard label="Today" value={`${data?.todayCompleted ?? 0}/3`} />
      </div>

      {confidenceData?.confidence && (
        <ClayCard className="p-4 mb-6" hover={false}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium m-0" style={{ color: "var(--text-primary)" }}>
                Plan precision
              </h3>
              <p className="text-xs mt-0.5 m-0" style={{ color: "var(--text-muted)" }}>
                How well MenAI can personalise your tasks — {confidenceData.confidence.total}/100
              </p>
            </div>
            {confidenceData.confidence.total < 80 && (
              <Link
                href={`/dashboard/chat?intent=improve_confidence&goalId=${goalId}`}
                className="btn-secondary text-xs no-underline px-3 py-1.5 flex items-center gap-1.5"
              >
                <Sparkles size={12} /> Improve precision
              </Link>
            )}
          </div>
          <div className="grid gap-2">
            {(
              [
                { key: "deadline" as const, label: "Deadline" },
                { key: "obstacle" as const, label: "Obstacle" },
                { key: "success" as const, label: "Success criteria" },
                { key: "resources" as const, label: "Resources" },
                { key: "history" as const, label: "Execution history" },
              ] as const
            ).map(({ key, label }) => {
              const score = confidenceData.confidence[key];
              const maxScore = key === "history" ? 20 : 20;
              const pct = Math.round((score / maxScore) * 100);
              const factorLabel = confidenceData.confidence.labels[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs w-32 shrink-0" style={{ color: "var(--text-muted)" }}>
                    {label}
                  </span>
                  <div
                    className="flex-1 rounded-full overflow-hidden"
                    style={{ height: 4, background: "var(--border-subtle)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct >= 50 ? "var(--accent-success)" : "var(--accent-warning)",
                      }}
                    />
                  </div>
                  <span className="text-[10px] w-28 shrink-0 text-right truncate" style={{ color: "var(--text-muted)" }}>
                    {factorLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </ClayCard>
      )}

      <ClayCard className="p-4 mb-6" hover={false}>
        <div className="clay-label mb-3">Milestone roadmap</div>
        {isLoading ? (
          <div className="skeleton shimmer" style={{ height: 60, borderRadius: 8 }} />
        ) : (
          <MilestoneRoadmap milestones={data?.milestones ?? []} />
        )}
      </ClayCard>

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        <ClayCard className="p-4" hover={false}>
          <h3 className="text-sm font-medium mb-2 m-0" style={{ color: "var(--text-primary)" }}>
            Success probability
          </h3>
          {(data?.tasksCompletedTotal ?? 0) > 0 ? (
            <RadialProgressChart
              title=""
              subtitle=""
              value={data?.successProbability ?? 0}
              loading={isLoading}
              label="Likelihood"
              hideHeader
              height={160}
            />
          ) : (
            <GhostRadial />
          )}
        </ClayCard>
        <div className="lg:col-span-2">
          <LineChartCard
            title="Daily performance"
            subtitle="Last 30 days"
            data={dailyChart}
            loading={isLoading}
            valueFormatter={(v) => `${v}%`}
            referenceLines={milestoneRefs}
            emptyMessage="Complete tasks to build your trend"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <ClayCard className="p-4" hover={false}>
          <h3 className="text-sm font-medium mb-4 m-0" style={{ color: "var(--text-primary)" }}>
            Completion heatmap
          </h3>
          <CompletionHeatmap
            cells={(data?.dailyTrend ?? []).map((d) => ({
              date: d.date,
              count: d.completed,
            }))}
          />
          {!hasHeatmapData && !isLoading && (
            <div className="mt-4">
              <GhostRadial size={100} message="Complete tasks to fill your heatmap" />
            </div>
          )}
        </ClayCard>
        {hasMonthlyData || isLoading ? (
          <BarChartCard
            title="Monthly trend"
            subtitle="Goal analytics"
            data={monthlyChart}
            loading={isLoading}
            valueFormatter={(v) => `${v}%`}
            emptyMessage="Complete tasks to build your history"
          />
        ) : (
          <ClayCard className="p-4 flex items-center justify-center" hover={false}>
            <GhostRadial message="Complete tasks to build monthly history" />
          </ClayCard>
        )}
      </div>

      <section className="grid gap-6 lg:grid-cols-2 mb-6">
        <ClayCard className="p-4" hover={false}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} style={{ color: "var(--accent-primary)" }} />
            <h3 className="text-sm font-medium m-0" style={{ color: "var(--text-primary)" }}>
              AI coaching insights
            </h3>
          </div>
          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: 120, borderRadius: "var(--radius-md)" }} />
          ) : (
            <>
              {paceInsight && (
                <p className="text-sm m-0 mb-3 leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {paceInsight}
                </p>
              )}
              {coachingBullets.length > 0 && (
                <ul className="text-sm space-y-2 m-0 pl-4" style={{ color: "var(--text-secondary)" }}>
                  {coachingBullets.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              {!paceInsight && coachingBullets.length === 0 && (
                <GhostRadial size={100} message="Complete tasks to unlock coaching insights" />
              )}
            </>
          )}
        </ClayCard>

        <ClayCard className="p-4" hover={false}>
          <div className="clay-label mb-2">Execution summary</div>
          {isLoading ? (
            <div className="skeleton shimmer" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ) : (
            <dl className="space-y-3 text-sm m-0">
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>Days completed (66%+)</dt>
                <dd className="font-data m-0" style={{ color: "var(--text-primary)" }}>
                  {data?.daysCompleted}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>Today score</dt>
                <dd className="font-data m-0" style={{ color: "var(--text-primary)" }}>
                  {data?.todayScore}%
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>Daily progress needed</dt>
                <dd className="font-data m-0" style={{ color: "var(--text-primary)" }}>
                  {data?.dailyProgressNeeded != null ? `${data.dailyProgressNeeded.toFixed(1)}%/day` : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>Est. completion</dt>
                <dd className="m-0" style={{ color: "var(--text-primary)" }}>
                  {data?.estimatedCompletionDate ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt style={{ color: "var(--text-muted)" }}>Health</dt>
                <dd className="m-0 truncate max-w-[55%] text-right" style={{ color: healthColor(data?.health.health ?? "on_track") }}>
                  {data?.health.reason}
                </dd>
              </div>
            </dl>
          )}
        </ClayCard>
      </section>
    </div>
  );
}
