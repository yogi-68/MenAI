"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";

interface PerformanceSummary {
  summary: {
    daily: number;
    streak: number;
  };
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
  const streak = data?.summary?.streak ?? 0;
  const ringColor =
    daily >= 66 ? "var(--accent-on-track)" : daily > 0 ? "var(--accent-missed)" : "var(--accent-muted)";

  const content = (
    <div
      className={compact ? "score-badge score-badge--compact" : "score-badge"}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="score-badge__ring" style={{ "--ring-color": ringColor } as React.CSSProperties}>
        <svg viewBox="0 0 36 36" className="score-badge__svg">
          <path
            className="score-badge__track"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          />
          <path
            className="score-badge__fill"
            strokeDasharray={`${daily}, 100`}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            style={{ stroke: ringColor }}
          />
        </svg>
        <span className="score-badge__value font-data" data-numeric>
          {isLoading ? "—" : daily}
        </span>
      </div>
      {!compact && (
        <div className="score-badge__meta">
          <span className="label">Today</span>
          <span className="score-badge__streak font-data" data-numeric>
            <Flame size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            {streak}d
          </span>
        </div>
      )}
    </div>
  );

  return (
    <Link href="/dashboard" aria-label="Performance score — open overview">
      {content}
    </Link>
  );
}
