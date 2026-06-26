"use client";

import { Area, AreaChart, Line, LineChart, ResponsiveContainer } from "recharts";

interface ScoreSparklineProps {
  points: Array<{ value: number }>;
  height?: number;
  showArea?: boolean;
}

export function ScoreSparkline({ points, height = 18, showArea = true }: ScoreSparklineProps) {
  const data =
    points.length > 0
      ? points
      : Array.from({ length: 7 }, () => ({ value: 0 }));

  const Chart = showArea ? AreaChart : LineChart;

  return (
    <div className="score-sparkline w-full" aria-hidden style={{ height }}>
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data}>
          {showArea && (
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent-primary)"
              fill="rgba(124, 111, 255, 0.2)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {!showArea && (
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--accent-primary)"
              strokeWidth={1.5}
              strokeDasharray={points.length === 0 ? "3 3" : undefined}
              dot={{ r: 2, fill: "var(--accent-primary)" }}
              isAnimationActive={false}
            />
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}
