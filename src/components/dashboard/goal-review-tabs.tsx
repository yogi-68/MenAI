"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChartCard, BarChartCard, RadialProgressChart } from "@/components/charts";
import { ClayCard } from "@/components/ui";

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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BarChartCard
        title="Week over week"
        subtitle={delta >= 0 ? `+${delta} vs last week` : `${delta} vs last week`}
        data={[
          { label: "Last week", value: lastAvg || thisAvg, fill: "var(--text-muted)" },
          { label: "This week", value: thisAvg, fill: "var(--accent-primary)" },
        ]}
        loading={loading}
        hideHeader={false}
      />
      <RadialProgressChart
        title="Weekly score"
        subtitle="Review"
        value={weeklyPerf?.summary?.weekly ?? 0}
        loading={loading}
        label="Weekly"
      />
      {(weeklyReview?.review?.whatHappened || weeklyReview?.review?.focusNextWeek) && (
        <ClayCard className="p-4 lg:col-span-2" hover={false}>
          <p className="label mb-2">Coach summary</p>
          {weeklyReview.review.whatHappened && (
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
              {weeklyReview.review.whatHappened}
            </p>
          )}
          {weeklyReview.review.focusNextWeek && (
            <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Focus next week: {weeklyReview.review.focusNextWeek}
            </p>
          )}
        </ClayCard>
      )}
    </div>
  );
}

export function MonthlyReviewPanel() {
  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ["analytics-performance", "30d"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=30d");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 120_000,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RadialProgressChart
        title="Monthly score"
        subtitle="Review"
        value={monthly?.summary?.monthly ?? 0}
        loading={monthlyLoading}
        label="Monthly"
      />
      <AreaChartCard
        title="30-day performance"
        subtitle="Area chart"
        data={(monthly?.trend ?? []).map((p: { label: string; value: number }) => ({
          label: p.label,
          value: p.value,
        }))}
        loading={monthlyLoading}
        valueFormatter={(v) => `${v}%`}
      />
    </div>
  );
}

/** @deprecated Overview owns tab chrome — use WeeklyReviewPanel / MonthlyReviewPanel */
export function GoalReviewTabs() {
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  return (
    <ClayCard className="p-5 md:p-6 mt-6" hover={false}>
      <div className="flex gap-2 mb-5">
        {(["weekly", "monthly"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={tab === t ? "btn-primary" : "btn-secondary"}
            style={{ padding: "8px 16px", fontSize: "0.82rem", textTransform: "capitalize" }}
          >
            {t} review
          </button>
        ))}
      </div>
      {tab === "weekly" ? <WeeklyReviewPanel /> : <MonthlyReviewPanel />}
    </ClayCard>
  );
}
