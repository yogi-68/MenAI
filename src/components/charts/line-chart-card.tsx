"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartShell } from "@/components/ui";
import { chartColors, chartDefaults, seriesColor } from "./chart-theme";
import { ChartEmptyState } from "./chart-empty-state";

export interface LineChartPoint {
  label: string;
  value: number;
  date?: string;
  [key: string]: string | number | undefined;
}

export interface ChartReferenceLine {
  label: string;
  /** Match against point label or date */
  at: string;
}

interface LineChartCardProps {
  title: string;
  subtitle?: string;
  data: LineChartPoint[];
  dataKey?: string;
  loading?: boolean;
  height?: number;
  action?: React.ReactNode;
  valueFormatter?: (v: number) => string;
  className?: string;
  referenceLines?: ChartReferenceLine[];
  emptyMessage?: string;
  forceEmpty?: boolean;
}

export function LineChartCard({
  title,
  subtitle,
  data,
  dataKey = "value",
  loading,
  height = 220,
  action,
  valueFormatter = (v) => String(v),
  className,
  referenceLines = [],
  emptyMessage = "Complete tasks to build your trend",
  forceEmpty = false,
}: LineChartCardProps) {
  const isEmpty =
    forceEmpty || (data.length > 0 && data.every((d) => d.value === 0));

  const body = isEmpty ? (
    <ChartEmptyState message={emptyMessage} variant="line" height={height} />
  ) : (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={chartDefaults.margin}>
        <CartesianGrid {...chartDefaults.cartesianGrid} />
        <XAxis dataKey="label" {...chartDefaults.axis} />
        <YAxis {...chartDefaults.axis} width={36} domain={[0, 100]} />
        <Tooltip
          {...chartDefaults.tooltip}
          formatter={(value) => [valueFormatter(Number(value)), title]}
        />
        {referenceLines.map((ref) => (
          <ReferenceLine
            key={ref.at}
            x={data.find((d) => d.date === ref.at || d.label === ref.at)?.label ?? ref.at}
            stroke="rgba(124, 111, 255, 0.4)"
            strokeDasharray="4 4"
            label={{
              value: ref.label,
              position: "insideTopRight",
              fill: "var(--text-muted)",
              fontSize: 10,
            }}
          />
        ))}
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={seriesColor(0)}
          strokeWidth={2}
          dot={{ r: 3, fill: chartColors.primary }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      {body}
    </ChartShell>
  );
}
