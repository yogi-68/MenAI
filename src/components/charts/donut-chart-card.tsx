"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartShell } from "@/components/ui";
import { chartColors, chartDefaults, seriesColor } from "./chart-theme";

export interface DonutChartPoint {
  label: string;
  value: number;
}

interface DonutChartCardProps {
  title: string;
  subtitle?: string;
  data: DonutChartPoint[];
  loading?: boolean;
  height?: number;
  centerLabel?: string;
  centerValue?: string | number;
  action?: React.ReactNode;
  className?: string;
}

export function DonutChartCard({
  title,
  subtitle,
  data,
  loading,
  height = 220,
  centerLabel,
  centerValue,
  action,
  className,
}: DonutChartCardProps) {
  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <div style={{ position: "relative", width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...chartDefaults.tooltip} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={seriesColor(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue !== undefined) && (
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
            {centerValue !== undefined && (
              <span style={{ fontSize: "1.75rem", fontWeight: 600, color: chartColors.primary }}>
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span style={{ fontSize: "0.75rem", color: chartColors.muted, marginTop: 2 }}>
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>
    </ChartShell>
  );
}
