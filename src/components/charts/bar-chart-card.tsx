"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartShell } from "@/components/ui";
import { chartDefaults, dailyScoreBarColor, seriesColor } from "./chart-theme";
import { ChartEmptyState } from "./chart-empty-state";

export interface BarChartPoint {
  label: string;
  value: number;
  fill?: string;
  [key: string]: string | number | undefined;
}

interface BarChartCardProps {
  title: string;
  subtitle?: string;
  data: BarChartPoint[];
  dataKey?: string;
  loading?: boolean;
  height?: number;
  action?: React.ReactNode;
  valueFormatter?: (v: number) => string;
  className?: string;
  hideHeader?: boolean;
  emptyMessage?: string;
  forceEmpty?: boolean;
}

function BarChartBody({
  data,
  dataKey,
  height,
  valueFormatter,
  title,
}: {
  data: BarChartPoint[];
  dataKey: string;
  height: number;
  valueFormatter: (v: number) => string;
  title: string;
}) {
  const usePerBarColor = data.some((d) => d.fill);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={chartDefaults.margin}>
        <CartesianGrid {...chartDefaults.cartesianGrid} />
        <XAxis dataKey="label" {...chartDefaults.axis} />
        <YAxis {...chartDefaults.axis} width={36} domain={[0, 100]} />
        <Tooltip
          {...chartDefaults.tooltip}
          formatter={(value) => [valueFormatter(Number(value)), title || "Score"]}
        />
        <Bar dataKey={dataKey} fill={seriesColor(0)} radius={[4, 4, 0, 0]} maxBarSize={32}>
          {usePerBarColor
            ? data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.fill ?? dailyScoreBarColor(entry.value)}
                />
              ))
            : null}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BarChartCard({
  title,
  subtitle,
  data,
  dataKey = "value",
  loading,
  height = 220,
  action,
  valueFormatter = (v) => String(v),
  className,
  hideHeader = false,
  emptyMessage,
  forceEmpty = false,
}: BarChartCardProps) {
  const isEmpty =
    forceEmpty || (data.length > 0 && data.every((d) => d.value === 0));

  const body = isEmpty ? (
    <ChartEmptyState message={emptyMessage} variant="bars" height={height} />
  ) : (
    <BarChartBody
      data={data}
      dataKey={dataKey}
      height={height}
      valueFormatter={valueFormatter}
      title={title}
    />
  );

  if (hideHeader) {
    if (loading) {
      return <div className="skeleton shimmer" style={{ height, borderRadius: "var(--radius-md)" }} />;
    }
    return body;
  }

  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      {body}
    </ChartShell>
  );
}
