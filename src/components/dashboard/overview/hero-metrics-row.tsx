"use client";

import { Flame, Flag, ListChecks } from "lucide-react";
import { ClayCard } from "@/components/ui";
import { RadialProgressChart } from "@/components/charts/radial-progress-chart";
import { GhostRadial } from "@/components/charts/ghost-radial";

interface HeroMetricsRowProps {
  executionScore: number;
  tasksCompletedThisWeek: number;
  tasksPlannedThisWeek: number;
  streak: number;
  nextMilestone: { title: string; progress: number; goalTitle: string } | null;
  loading?: boolean;
}

export function HeroMetricsRow({
  executionScore,
  tasksCompletedThisWeek,
  tasksPlannedThisWeek,
  streak,
  nextMilestone,
  loading,
}: HeroMetricsRowProps) {
  const taskPct =
    tasksPlannedThisWeek > 0
      ? Math.round((tasksCompletedThisWeek / tasksPlannedThisWeek) * 100)
      : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ClayCard className="p-4" hover={false}>
        <p className="text-xs m-0 mb-2" style={{ color: "var(--text-muted)" }}>
          Execution score
        </p>
        {loading ? (
          <div className="skeleton shimmer" style={{ height: 120, borderRadius: 12 }} />
        ) : executionScore > 0 ? (
          <RadialProgressChart
            title=""
            value={executionScore}
            hideHeader
            height={120}
            label="Score"
          />
        ) : (
          <GhostRadial message="Complete tasks to build your score" size={100} />
        )}
      </ClayCard>

      <ClayCard className="p-4 flex flex-col justify-between" hover={false}>
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={16} style={{ color: "var(--accent-primary)" }} />
          <p className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
            Tasks this week
          </p>
        </div>
        <div>
          <p className="font-data text-2xl font-semibold m-0 mb-2" style={{ color: "var(--text-primary)" }}>
            {tasksCompletedThisWeek}/{tasksPlannedThisWeek || "—"}
          </p>
          <div
            className="rounded-full overflow-hidden"
            style={{ height: 6, background: "var(--border-subtle)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${taskPct}%`, background: "var(--accent-primary)" }}
            />
          </div>
        </div>
      </ClayCard>

      <ClayCard className="p-4 flex flex-col justify-between" hover={false}>
        <div className="flex items-center gap-2 mb-3">
          <Flame size={16} style={{ color: "var(--accent-warning)" }} />
          <p className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
            Current streak
          </p>
        </div>
        <p className="font-data text-2xl font-semibold m-0" style={{ color: "var(--text-primary)" }}>
          {streak} {streak === 1 ? "day" : "days"}
        </p>
      </ClayCard>

      <ClayCard className="p-4 flex flex-col justify-between" hover={false}>
        <div className="flex items-center gap-2 mb-3">
          <Flag size={16} style={{ color: "var(--accent-success)" }} />
          <p className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
            Next milestone
          </p>
        </div>
        {nextMilestone ? (
          <>
            <p className="text-sm font-medium m-0 mb-1 truncate" style={{ color: "var(--text-primary)" }}>
              {nextMilestone.title}
            </p>
            <p className="text-[11px] m-0 mb-2 truncate" style={{ color: "var(--text-muted)" }}>
              {nextMilestone.goalTitle}
            </p>
            <div
              className="rounded-full overflow-hidden"
              style={{ height: 4, background: "var(--border-subtle)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, nextMilestone.progress)}%`,
                  background: "var(--accent-success)",
                }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm m-0" style={{ color: "var(--text-muted)" }}>
            Add milestones to your goals
          </p>
        )}
      </ClayCard>
    </div>
  );
}
