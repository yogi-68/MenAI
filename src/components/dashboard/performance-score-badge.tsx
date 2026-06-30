"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ScoreSparkline } from "@/components/charts/score-sparkline";
import { AnimatedScore } from "@/components/ui/animated-score";

interface PerformanceSummary {
  summary: {
    daily: number;
    streak: number;
    tasksCompletedToday?: number;
    tasksDueToday?: number;
  };
  trend?: Array<{ label: string; value: number }>;
}

interface PerformanceScoreBadgeProps {
  compact?: boolean;
}

export function PerformanceScoreBadge({ compact = false }: PerformanceScoreBadgeProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["performance-daily"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/performance?range=7d");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<PerformanceSummary>;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: true,
  });

  const daily = data?.summary?.daily ?? 0;
  const completed = data?.summary?.tasksCompletedToday ?? 0;
  const expected = data?.summary?.tasksDueToday ?? 0;
  const taskLine =
    expected > 0
      ? `${completed} of ${expected} tasks done`
      : completed > 0
        ? `${completed} task${completed === 1 ? "" : "s"} done`
        : "No tasks due today";

  return (
    <Link
      href="/dashboard"
      aria-label="Performance score — open overview"
      className={compact ? "score-hero score-hero--compact" : "score-hero"}
    >
      {!compact && <div className="score-hero__label">Today&apos;s plan</div>}
      {isLoading ? (
        <div className="score-hero__value font-data" data-numeric>
          —
        </div>
      ) : (
        <AnimatedScore value={daily} className="score-hero__value font-data" />
      )}
      {!compact && (
        <>
          <div className="score-hero__subtitle">
            {expected > 0 ? (
              <>
                {completed} of {expected}
                <br />
                tasks done
              </>
            ) : (
              taskLine
            )}
          </div>
          {!isLoading && (
            <ScoreSparkline
              points={(data?.trend ?? []).slice(-7).map((p) => ({ value: p.value }))}
              height={18}
            />
          )}
        </>
      )}
    </Link>
  );
}
