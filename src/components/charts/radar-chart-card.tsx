"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartShell } from "@/components/ui";
import { chartColors, chartDefaults, seriesColor } from "./chart-theme";

export interface RadarChartPoint {
  label: string;
  value: number;
  fullMark?: number;
}

interface RadarChartCardProps {
  title: string;
  subtitle?: string;
  data: RadarChartPoint[];
  loading?: boolean;
  height?: number;
  maxValue?: number;
  action?: React.ReactNode;
  className?: string;
}

export function RadarChartCard({
  title,
  subtitle,
  data,
  loading,
  height = 260,
  maxValue = 100,
  action,
  className,
}: RadarChartCardProps) {
  const chartData = data.map((d) => ({ ...d, fullMark: d.fullMark ?? maxValue }));

  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke={chartColors.grid} />
          <PolarAngleAxis dataKey="label" tick={{ fill: chartColors.muted, fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, maxValue]} tick={false} axisLine={false} />
          <Tooltip {...chartDefaults.tooltip} />
          <Radar
            name={title}
            dataKey="value"
            stroke={seriesColor(0)}
            fill={seriesColor(0)}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
