"use client";

import { RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

interface DailyCompletionRingProps {
  completed: number;
  total: number;
  size?: number;
}

export function DailyCompletionRing({ completed, total, size = 88 }: DailyCompletionRingProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const fill =
    pct >= 67 ? "var(--accent-primary)" : pct >= 34 ? "var(--accent-warning)" : "var(--accent-danger)";

  const data = [{ name: "done", value: pct, fill }];

  return (
    <div className="flex items-center gap-3">
      <div style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={8}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "var(--bg-tertiary)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <div className="font-data text-lg" data-numeric style={{ color: "var(--text-primary)" }}>
          {completed}/{total}
        </div>
        <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
          tasks done · {pct}%
        </div>
      </div>
    </div>
  );
}

interface GoalCompletionRingProps {
  goalTitle: string;
  completed: number;
  total?: number;
  color: string;
  size?: number;
}

export function GoalCompletionRing({
  goalTitle,
  completed,
  total = 3,
  color,
  size = 56,
}: GoalCompletionRingProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const data = [{ name: "done", value: pct, fill: color }];

  return (
    <div className="flex flex-col items-center gap-1" style={{ minWidth: 72 }}>
      <div style={{ width: size, height: size, position: "relative" }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="68%"
            outerRadius="100%"
            barSize={6}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={3} background={{ fill: "var(--bg-tertiary)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          className="absolute inset-0 flex items-center justify-center font-data text-[11px]"
          style={{ color: "var(--text-primary)" }}
        >
          {completed}/{total}
        </div>
      </div>
      <span
        className="text-[11px] text-center truncate w-full"
        style={{ color: "var(--text-muted)" }}
        title={goalTitle}
      >
        {goalTitle}
      </span>
    </div>
  );
}

interface GoalRingItem {
  goalTitle: string;
  completed: number;
  total?: number;
  color: string;
}

export function GoalCompletionRingRow({ goals }: { goals: GoalRingItem[] }) {
  if (goals.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-4 justify-start py-2">
      {goals.map((g) => (
        <GoalCompletionRing
          key={g.goalTitle}
          goalTitle={g.goalTitle}
          completed={g.completed}
          total={g.total ?? 3}
          color={g.color}
        />
      ))}
    </div>
  );
}
