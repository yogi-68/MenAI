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
    pct >= 67 ? "var(--accent-primary)" : pct >= 34 ? "#f59e0b" : "#ef4444";

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
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "var(--bg-secondary)" }} />
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
