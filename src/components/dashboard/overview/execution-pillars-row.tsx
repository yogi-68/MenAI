"use client";

import Link from "next/link";
import { ClayCard } from "@/components/ui";
import { RadialProgressChart } from "@/components/charts/radial-progress-chart";
import { GhostRadial } from "@/components/charts/ghost-radial";

interface ExecutionPillarsRowProps {
  planning: number;
  execution: number;
  reflection: number;
  labels: { planning: string; execution: string; reflection: string };
  loading?: boolean;
}

const PILLARS = [
  { key: "planning" as const, title: "Planning" },
  { key: "execution" as const, title: "Execution" },
  { key: "reflection" as const, title: "Reflection" },
];

export function ExecutionPillarsRow({
  planning,
  execution,
  reflection,
  labels,
  loading,
}: ExecutionPillarsRowProps) {
  const scores = { planning, execution, reflection };

  return (
    <ClayCard className="p-4" hover={false}>
      <h2 className="text-sm font-medium m-0 mb-4" style={{ color: "var(--text-primary)" }}>
        Execution pillars
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map(({ key, title }) => {
          const score = scores[key];
          const cta = labels[key];
          return (
            <div key={key} className="flex flex-col items-center text-center gap-2">
              <p className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
                {title}
              </p>
              {loading ? (
                <div className="skeleton shimmer" style={{ width: 80, height: 80, borderRadius: "50%" }} />
              ) : score > 0 ? (
                <RadialProgressChart
                  title=""
                  value={score}
                  hideHeader
                  height={80}
                  label={title}
                />
              ) : (
                <GhostRadial message="" size={80} />
              )}
              {score < 50 && (
                <Link
                  href="/dashboard/chat"
                  className="text-[11px] no-underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  {cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </ClayCard>
  );
}
