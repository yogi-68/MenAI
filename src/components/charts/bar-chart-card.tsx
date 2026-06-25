"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartShell } from "@/components/ui";
import { chartDefaults, seriesColor } from "./chart-theme";

export interface BarChartPoint {
  label: string;
  value: number;
  [key: string]: string | number;
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
}: BarChartCardProps) {
  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={chartDefaults.margin}>
          <CartesianGrid {...chartDefaults.cartesianGrid} />
          <XAxis dataKey="label" {...chartDefaults.axis} />
          <YAxis {...chartDefaults.axis} width={36} />
          <Tooltip
            {...chartDefaults.tooltip}
            formatter={(value) => [valueFormatter(Number(value)), title]}
          />
          <Bar dataKey={dataKey} fill={seriesColor(0)} radius={[6, 6, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
