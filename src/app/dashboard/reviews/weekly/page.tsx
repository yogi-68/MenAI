"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import {
  LineChartCard,
  AreaChartCard,
  BarChartCard,
  DonutChartCard,
  TimeRangeFilter,
  type TimeRange,
} from "@/components/charts";
import { ClayCard } from "@/components/ui";
import { useState } from "react";

interface WeeklyReviewPayload {
  review: {
    whatHappened: string;
    patternDetected: string;
    biggestWin: string;
    biggestRisk: string;
    focusNextWeek: string;
  };
  weekStart: string;
  weekEnd: string;
}

function NarrativeBlock({ title, body }: { title: string; body: string }) {
  if (!body?.trim()) return null;
  return (
    <ClayCard className="p-5 md:p-6" hover={false}>
      <div className="clay-label mb-2">Review</div>
      <h3 className="text-base font-medium mb-3" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {body}
      </p>
    </ClayCard>
  );
}

export default function WeeklyReviewPage() {
  const [range, setRange] = useState<TimeRange>("7d");

  const { data: review, isLoading: reviewLoading } = useQuery({
    queryKey: ["analytics-review-weekly"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/reviews/weekly");
      if (!res.ok) throw new Error("Failed to load review");
      return res.json() as Promise<WeeklyReviewPayload>;
    },
    staleTime: 60_000,
  });

  const { data: performance, isLoading: perfLoading } = useQuery({
    queryKey: ["analytics-performance", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/performance?range=${range}`);
      if (!res.ok) throw new Error("Failed to load performance");
      return res.json();
    },
  });

  const { data: habits, isLoading: habitsLoading } = useQuery({
    queryKey: ["analytics-habits"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/habits");
      if (!res.ok) throw new Error("Failed to load habits");
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

  const trendData = (performance?.trend ?? []).map(
    (r: { label: string; value: number }) => ({ label: r.label, value: r.value })
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
        <h1 className="text-2xl md:text-3xl font-medium tracking-tight">Weekly Review</h1>
        {review && (
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            {review.weekStart} — {review.weekEnd}
          </p>
        )}
      </header>

      <div className="flex justify-end mb-6">
        <TimeRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <LineChartCard
          title="Performance trend"
          subtitle="Weekly Review"
          data={trendData}
          loading={perfLoading}
          valueFormatter={(v) => `${v}%`}
        />
        <BarChartCard
          title="Goal scores today"
          subtitle="Weekly Review"
          data={performance?.goalBreakdown ?? []}
          loading={perfLoading}
          valueFormatter={(v) => `${v}%`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        <BarChartCard
          title="Habit streaks"
          subtitle="Habits"
          data={habits?.topStreaks ?? []}
          loading={habitsLoading}
        />
        <DonutChartCard
          title="Timeline activity"
          subtitle="Events by category"
          data={timeline?.byCategory ?? []}
          loading={timelineLoading}
          centerValue={timeline?.total ?? 0}
          centerLabel="events"
        />
      </div>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} style={{ color: "var(--accent-primary)" }} />
          <h2 className="text-sm uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Coach narrative
          </h2>
        </div>
        {reviewLoading ? (
          <div className="skeleton shimmer" style={{ height: 120, borderRadius: "var(--radius-md)" }} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <NarrativeBlock title="What happened" body={review?.review.whatHappened ?? ""} />
            <NarrativeBlock title="Pattern detected" body={review?.review.patternDetected ?? ""} />
            <NarrativeBlock title="Biggest win" body={review?.review.biggestWin ?? ""} />
            <NarrativeBlock title="Biggest risk" body={review?.review.biggestRisk ?? ""} />
            <div className="md:col-span-2">
              <NarrativeBlock title="Focus next week" body={review?.review.focusNextWeek ?? ""} />
            </div>
          </div>
        )}
      </section>

      {timeline?.timeline?.length > 0 && (
        <AreaChartCard
          title="Activity over time"
          subtitle="Timeline"
          data={timeline.timeline}
          loading={timelineLoading}
        />
      )}
    </div>
  );
}
