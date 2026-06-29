"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { ClayCard } from "@/components/ui";
import { goalAccent } from "@/lib/goals/goal-colors";

export interface GoalOverviewSummary {
  id: string;
  title: string;
  progress: number;
  targetDate: string | null;
  remainingDays: number | null;
  todayScore: number;
  healthLabel: string;
  currentMilestone: string | null;
  confidenceScore: number | null;
  colorIndex: number;
}

export function GoalOverviewCard({ goal }: { goal: GoalOverviewSummary }) {
  const accent = goalAccent(goal.colorIndex);
  const isLowConfidence =
    goal.confidenceScore !== null && goal.confidenceScore < 60;

  return (
    <Link href={`/dashboard/goals/${goal.id}`} className="no-underline block">
      <ClayCard className="p-3 gap-2" hover>
        <h3
          className="leading-snug m-0 truncate text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {goal.title}
        </h3>

        <div
          className="rounded-full overflow-hidden"
          style={{ height: 4, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, goal.progress)}%`, background: accent }}
          />
        </div>

        <div className="flex justify-between items-center text-xs">
          <span style={{ fontWeight: 500, color: accent }}>
            {goal.progress}% complete
          </span>
          {goal.remainingDays != null ? (
            <span style={{ color: "var(--text-muted)" }}>{goal.remainingDays} days left</span>
          ) : (
            <span style={{ color: "var(--accent-warning)" }}>No deadline</span>
          )}
        </div>

        {goal.confidenceScore !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              className="rounded-full overflow-hidden flex-1"
              style={{ height: 2, background: "var(--border-subtle)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${goal.confidenceScore}%`,
                  background: isLowConfidence ? "var(--accent-warning)" : "var(--accent-success)",
                }}
              />
            </div>
            <span
              className="text-[10px] shrink-0 flex items-center gap-0.5"
              style={{ color: isLowConfidence ? "var(--accent-warning)" : "var(--text-muted)" }}
            >
              {isLowConfidence && <Zap size={9} />}
              {goal.confidenceScore}%
            </span>
          </div>
        )}

        <p className="text-[11px] m-0 truncate" style={{ color: "var(--text-muted)" }}>
          {goal.currentMilestone ?? "No milestone yet"}
        </p>
      </ClayCard>
    </Link>
  );
}
