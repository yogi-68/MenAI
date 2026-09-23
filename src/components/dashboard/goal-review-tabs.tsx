"use client";

import { useQuery } from "@tanstack/react-query";
import { AreaChartCard, BarChartCard, RadialProgressChart } from "@/components/charts";
import { ClayCard } from "@/components/ui";

function toBullets(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

export function WeeklyReviewPanel() {
  const { data: weeklyReview, isLoading: weeklyReviewLoading } = useQuery({
    queryKey: ["review-weekly"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/reviews/weekly");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 120_000,
  });

  const { data: weeklyPerf, isLoading: weeklyPerfLoading } = useQuery({
    queryKey: ["analytics-performance", "7d"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=7d");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 120_000,
  });

  const loading = weeklyReviewLoading || weeklyPerfLoading;

  const trend = weeklyPerf?.trend ?? [];
  const thisWeek = trend.slice(-7);
  const lastWeek = trend.slice(-14, -7);
  const thisAvg =
    thisWeek.length > 0
      ? Math.round(thisWeek.reduce((a: number, p: { value: number }) => a + p.value, 0) / thisWeek.length)
      : weeklyPerf?.summary?.weekly ?? 0;
  const lastAvg =
    lastWeek.length > 0
      ? Math.round(lastWeek.reduce((a: number, p: { value: number }) => a + p.value, 0) / lastWeek.length)
      : 0;
  const delta = thisAvg - lastAvg;

  const happenedBullets = weeklyReview?.review?.whatHappened
    ? toBullets(weeklyReview.review.whatHappened)
    : [];
  const focusBullets = weeklyReview?.review?.focusNextWeek
    ? toBullets(weeklyReview.review.focusNextWeek)
    : [];

  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      <ClayCard className="p-4 lg:col-span-2" hover={false}>
        <div className="flex justify-between items-start mb-3 gap-2">
          <div>
            <h3 className="text-sm font-medium m-0" style={{ color: "var(--text-primary)" }}>
              Week over week
            </h3>
            <p className="text-[11px] m-0 mt-0.5" style={{ color: "var(--text-muted)" }}>
              Score comparison
            </p>
          </div>
          {delta !== 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-md"
              style={{
                color: delta >= 0 ? "var(--accent-success)" : "var(--accent-danger)",
                background: "var(--bg-glass)",
                border: "0.5px solid var(--border-subtle)",
              }}
            >
              {delta >= 0 ? "+" : ""}
              {delta} {delta >= 0 ? "↑" : "↓"}
            </span>
          )}
        </div>
        <BarChartCard
          title=""
          subtitle=""
          data={[
            { label: "Last week", value: lastAvg || thisAvg, fill: "var(--text-muted)" },
            { label: "This week", value: thisAvg, fill: "var(--accent-primary)" },
          ]}
          loading={loading}
          hideHeader
        />
      </ClayCard>
      <RadialProgressChart
        title="Weekly score"
        subtitle="Review"
        value={weeklyPerf?.summary?.weekly ?? 0}
        loading={loading}
        label="Weekly"
      />
      {(happenedBullets.length > 0 || focusBullets.length > 0) && (
        <ClayCard className="p-4 lg:col-span-2" hover={false}>
          <p className="label mb-2">Coach summary</p>
          {happenedBullets.length > 0 && (
            <ul className="text-sm space-y-1 m-0 pl-4 mb-3" style={{ color: "var(--text-primary)" }}>
              {happenedBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {focusBullets.length > 0 && (
            <>
              <p className="label mb-1">Focus next week</p>
              <ul className="text-sm space-y-1 m-0 pl-4" style={{ color: "var(--text-secondary)" }}>
                {focusBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </>
          )}
        </ClayCard>
      )}
    </div>
  );
}

export function MonthlyReviewPanel() {
  const { data: monthlyReview, isLoading: monthlyReviewLoading } = useQuery({
    queryKey: ["review-monthly"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/reviews/monthly");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 120_000,
  });

  const { data: monthlyPerf, isLoading: monthlyPerfLoading } = useQuery({
    queryKey: ["analytics-performance", "30d"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=30d");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 120_000,
  });

  const loading = monthlyReviewLoading || monthlyPerfLoading;
  const trend = (monthlyPerf?.trend ?? []).map((p: { label: string; value: number }) => ({
    label: p.label,
    value: p.value,
  }));

  return (
    <div className="grid gap-2.5 lg:grid-cols-2">
      <RadialProgressChart
        title="Monthly score"
        subtitle="Review"
        value={monthlyPerf?.summary?.monthly ?? 0}
        loading={loading}
        label="Monthly"
      />
      <AreaChartCard
        title="30-day trend"
        subtitle="Daily scores"
        data={trend}
        loading={loading}
        valueFormatter={(v) => `${v}%`}
      />
      {monthlyReview?.review?.headline && (
        <ClayCard className="p-4 lg:col-span-2" hover={false}>
          <p className="label mb-2">Coach summary</p>
          <ul className="text-sm space-y-1 m-0 pl-4" style={{ color: "var(--text-primary)" }}>
            {toBullets(monthlyReview.review.headline).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </ClayCard>
      )}
    </div>
  );
}

/** @deprecated — use WeeklyReviewPanel / MonthlyReviewPanel directly */
export function GoalReviewTabs() {
  return null;
}
