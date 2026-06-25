"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChartCard, LineChartCard, RadialProgressChart } from "@/components/charts";
import { ClayCard } from "@/components/ui";

type Tab = "weekly" | "monthly";

export function GoalReviewTabs() {
  const [tab, setTab] = useState<Tab>("weekly");

  const { data: weeklyReview, isLoading: weeklyReviewLoading } = useQuery({
    queryKey: ["review-weekly"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/reviews/weekly");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: tab === "weekly",
    staleTime: 120_000,
  });

  const { data: weeklyPerf, isLoading: weeklyPerfLoading } = useQuery({
    queryKey: ["analytics-performance", "7d"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=7d");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: tab === "weekly",
    staleTime: 120_000,
  });

  const { data: monthly, isLoading: monthlyLoading } = useQuery({
    queryKey: ["analytics-performance", "30d"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=30d");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: tab === "monthly",
    staleTime: 120_000,
  });

  const weeklyLoading = weeklyReviewLoading || weeklyPerfLoading;

  return (
    <ClayCard className="p-5 md:p-6 mt-6" hover={false}>
      <div className="flex gap-2 mb-5">
        {(["weekly", "monthly"] as Tab[]).map((t) => (
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

      {tab === "weekly" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RadialProgressChart
            title="Weekly score"
            subtitle="Review"
            value={weeklyPerf?.summary?.weekly ?? 0}
            loading={weeklyLoading}
            label="Weekly"
          />
          <LineChartCard
            title="Score trend"
            subtitle="7-day line chart"
            data={(weeklyPerf?.trend ?? []).map((p: { label: string; value: number }) => ({
              label: p.label,
              value: p.value,
            }))}
            loading={weeklyLoading}
            valueFormatter={(v) => `${v}%`}
          />
          {weeklyReview?.review?.headline && (
            <div className="lg:col-span-2 clay-card-inset p-4 rounded-2xl">
              <p className="clay-label mb-2">Coach summary</p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {weeklyReview.review.headline}
              </p>
              {weeklyReview.review.summary && (
                <p className="text-sm mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {weeklyReview.review.summary}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "monthly" && (
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
      )}
    </ClayCard>
  );
}
