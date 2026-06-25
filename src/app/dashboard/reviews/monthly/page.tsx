"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  RadarChartCard,
  LineChartCard,
  BarChartCard,
  AreaChartCard,
  RadialProgressChart,
  TimeRangeFilter,
  type TimeRange,
} from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { useState } from "react";

function StatTile({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <ClayCard className="p-4 text-center" hover={false}>
      <div className="text-2xl font-semibold" style={{ color: "var(--accent-primary)" }}>
        {value}
        {suffix}
      </div>
      <div className="text-xs mt-1 clay-label">{label}</div>
    </ClayCard>
  );
}

export default function MonthlyReviewPage() {
  const [range, setRange] = useState<TimeRange>("30d");

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ["analytics-performance", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/performance?range=${range}`);
      if (!res.ok) throw new Error("Failed to load performance");
      return res.json();
    },
  });

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/overview");
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
  });

  const { data: timeline, isLoading: timelineLoading } = useQuery({
    queryKey: ["analytics-timeline", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/timeline?range=${range}`);
      if (!res.ok) throw new Error("Failed to load timeline");
      return res.json();
    },
  });

  const summary = performance?.summary;
  const radarData = (performance?.lifeAreaBreakdown ?? []).map(
    (a: { label: string; value: number }) => ({ label: a.label, value: a.value })
  );

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
        <p className="clay-label mb-2">Analytics</p>
        <h1 className="text-2xl md:text-3xl font-medium tracking-tight">Monthly Review</h1>
        <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
          Aggregated execution across life areas and goals
        </p>
      </header>

      <div className="flex justify-end mb-6">
        <TimeRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-8">
        <StatTile label="Monthly avg" value={summary?.monthly ?? "—"} suffix="%" />
        <StatTile label="Completion" value={summary?.completionPct ?? "—"} suffix="%" />
        <StatTile label="Streak" value={summary?.streak ?? "—"} suffix=" days" />
        <StatTile label="Success rate" value={summary?.successRate ?? "—"} suffix="%" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <RadialProgressChart
          title="Overall performance"
          subtitle="Monthly"
          value={summary?.monthly ?? 0}
          loading={perfLoading}
        />
        <div className="lg:col-span-2">
          <RadarChartCard
            title="Life area balance"
            subtitle="Execution rate by area"
            data={radarData}
            loading={perfLoading}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <LineChartCard
          title="Performance trend"
          subtitle="Monthly aggregates"
          data={(performance?.trend ?? []).map((r: { label: string; value: number }) => ({
            label: r.label,
            value: r.value,
          }))}
          loading={perfLoading}
          valueFormatter={(v) => `${v}%`}
        />
        <BarChartCard
          title="Initiative execution"
          subtitle="By goal"
          data={performance?.initiativeBreakdown ?? []}
          loading={perfLoading}
          valueFormatter={(v) => `${v}%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <AreaChartCard
          title="Timeline activity"
          subtitle="Events over time"
          data={timeline?.timeline ?? []}
          loading={timelineLoading}
        />
        <ClayCard className="p-5 md:p-6" hover={false}>
          <div className="clay-label mb-2">Goals</div>
          <h3 className="text-base font-medium mb-4" style={{ color: "var(--text-primary)" }}>
            Active portfolio
          </h3>
          {overviewLoading ? (
            <div className="skeleton shimmer" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ) : (overview?.goals ?? []).length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No active goals yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {(overview?.goals ?? []).map(
                (g: {
                  id: string;
                  title: string;
                  progress: number;
                  daysCompleted: number;
                  streak: number;
                }) => (
                  <li key={g.id}>
                    <Link
                      href={`/dashboard/goals/${g.id}`}
                      className="flex justify-between items-center text-sm"
                      style={{ color: "var(--text-primary)", textDecoration: "none" }}
                    >
                      <span>{g.title}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {g.progress}% · {g.daysCompleted}d · 🔥{g.streak}
                      </span>
                    </Link>
                  </li>
                )
              )}
            </ul>
          )}
        </ClayCard>
      </div>
    </div>
  );
}
