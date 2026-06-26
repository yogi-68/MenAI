"use client";

import { RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { ChartShell } from "@/components/ui";
import { chartColors, seriesColor } from "./chart-theme";

interface RadialProgressChartProps {
  title: string;
  subtitle?: string;
  value: number;
  max?: number;
  loading?: boolean;
  height?: number;
  label?: string;
  action?: React.ReactNode;
  className?: string;
}

export function RadialProgressChart({
  title,
  subtitle,
  value,
  max = 100,
  loading,
  height = 200,
  label = "Score",
  action,
  className,
}: RadialProgressChartProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const arcValue = Math.max(pct, 5);
  const data = [{ name: "progress", value: arcValue, fill: seriesColor(0) }];
  const centerLabel = label === "Likelihood" ? `${pct}%` : label;

  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <div style={{ position: "relative", width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="80%"
            barSize={14}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar
              background={{ fill: "rgba(124, 111, 255, 0.08)" }}
              dataKey="value"
              cornerRadius={8}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span className="font-data" style={{ color: chartColors.primary, fontSize: "1.75rem", fontWeight: 700 }} data-numeric>
            {pct}%
          </span>
          <span style={{ fontSize: "0.75rem", color: chartColors.muted }}>{centerLabel}</span>
        </div>
      </div>
    </ChartShell>
  );
}
