"use client";

import { Line, LineChart, ResponsiveContainer } from "recharts";

interface ScoreSparklineProps {
  points: Array<{ value: number }>;
}

export function ScoreSparkline({ points }: ScoreSparklineProps) {
  if (points.length === 0) return null;

  return (
    <div className="score-sparkline" aria-hidden>
      <ResponsiveContainer width="100%" height={20}>
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent-primary)"
            strokeWidth={2}
            dot={{ r: 2, fill: "var(--accent-primary)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
