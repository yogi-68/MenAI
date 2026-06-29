"use client";

import { ClayCard } from "@/components/ui";
import { RadialProgressChart } from "@/components/charts/radial-progress-chart";
import { DonutChartCard } from "@/components/charts/donut-chart-card";
import { BarChartCard } from "@/components/charts";
import { GhostRadial } from "@/components/charts/ghost-radial";
import { seriesColor } from "@/components/charts/chart-theme";

interface AnalyticsRowProps {
  planAdherence: number;
  taskOutcomes: { completed: number; skipped: number; missed: number };
  activeTime: Array<{ label: string; value: number }>;
  executionBlockers: Array<{ label: string; count: number }>;
  confidenceTrend: Array<{ label: string; value: number }>;
  loading?: boolean;
}

export function AnalyticsRow({
  planAdherence,
  taskOutcomes,
  activeTime,
  executionBlockers,
  confidenceTrend,
  loading,
}: AnalyticsRowProps) {
  const outcomesData = [
    { label: "Done", value: taskOutcomes.completed, fill: seriesColor(0) },
    { label: "Skipped", value: taskOutcomes.skipped, fill: seriesColor(1) },
    { label: "Missed", value: taskOutcomes.missed, fill: seriesColor(2) },
  ];
  const hasOutcomes = outcomesData.some((d) => d.value > 0);
  const hasActiveTime = activeTime.some((d) => d.value > 0);
  const maxBlocker = Math.max(...executionBlockers.map((b) => b.count), 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <ClayCard className="p-3" hover={false}>
        <p className="text-xs m-0 mb-2" style={{ color: "var(--text-muted)" }}>
          Plan adherence
        </p>
        {loading ? (
          <div className="skeleton shimmer" style={{ height: 100, borderRadius: 12 }} />
        ) : planAdherence > 0 ? (
          <RadialProgressChart title="" value={planAdherence} hideHeader height={100} label="Month" />
        ) : (
          <GhostRadial size={90} message="Complete tasks this month" />
        )}
      </ClayCard>

      <ClayCard className="p-3" hover={false}>
        <p className="text-xs m-0 mb-2" style={{ color: "var(--text-muted)" }}>
          Task outcomes
        </p>
        {loading ? (
          <div className="skeleton shimmer" style={{ height: 100, borderRadius: 12 }} />
        ) : hasOutcomes ? (
          <BarChartCard
            title=""
            data={outcomesData}
            hideHeader
            height={100}
            valueFormatter={(v) => String(v)}
          />
        ) : (
          <GhostRadial size={90} message="No task history yet" />
        )}
      </ClayCard>

      <ClayCard className="p-3" hover={false}>
        {loading ? (
          <div className="skeleton shimmer" style={{ height: 120, borderRadius: 12 }} />
        ) : hasActiveTime ? (
          <DonutChartCard
            title="Most active time"
            data={activeTime}
            height={120}
            centerLabel="Peak"
            centerValue={activeTime.reduce((a, b) => (b.value > a.value ? b : a)).label}
          />
        ) : (
          <>
            <p className="text-xs m-0 mb-2" style={{ color: "var(--text-muted)" }}>
              Most active time
            </p>
            <GhostRadial size={90} message="Complete tasks to see patterns" />
          </>
        )}
      </ClayCard>

      <ClayCard className="p-3" hover={false}>
        <p className="text-xs m-0 mb-3" style={{ color: "var(--text-muted)" }}>
          Top blockers
        </p>
        {executionBlockers.length === 0 ? (
          <p className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
            No blockers logged yet
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {executionBlockers.slice(0, 3).map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span style={{ color: "var(--text-secondary)" }}>{b.label.replace(/_/g, " ")}</span>
                  <span style={{ color: "var(--text-muted)" }}>{b.count}</span>
                </div>
                <div
                  className="rounded-full overflow-hidden"
                  style={{ height: 4, background: "var(--border-subtle)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((b.count / maxBlocker) * 100)}%`,
                      background: "var(--accent-warning)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </ClayCard>

      <ClayCard className="p-3" hover={false}>
        <p className="text-xs m-0 mb-2" style={{ color: "var(--text-muted)" }}>
          Confidence trend
        </p>
        {loading ? (
          <div className="skeleton shimmer" style={{ height: 100, borderRadius: 12 }} />
        ) : confidenceTrend.length > 0 ? (
          <BarChartCard
            title=""
            data={confidenceTrend.map((d) => ({ label: d.label, value: d.value, fill: seriesColor(0) }))}
            hideHeader
            height={100}
            valueFormatter={(v) => `${v}%`}
          />
        ) : (
          <GhostRadial size={90} message="Build plan precision over time" />
        )}
      </ClayCard>
    </div>
  );
}
