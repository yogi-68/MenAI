"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartShell } from "@/components/ui";
import { chartDefaults, seriesColor } from "./chart-theme";

export interface PieChartPoint {
  label: string;
  value: number;
}

interface PieChartCardProps {
  title: string;
  subtitle?: string;
  data: PieChartPoint[];
  loading?: boolean;
  height?: number;
  action?: React.ReactNode;
  className?: string;
}

export function PieChartCard({
  title,
  subtitle,
  data,
  loading,
  height = 220,
  action,
  className,
}: PieChartCardProps) {
  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip {...chartDefaults.tooltip} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
