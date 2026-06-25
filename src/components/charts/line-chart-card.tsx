"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartShell } from "@/components/ui";
import { chartColors, chartDefaults, seriesColor } from "./chart-theme";

export interface LineChartPoint {
  label: string;
  value: number;
  [key: string]: string | number;
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
}: LineChartCardProps) {
  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={chartDefaults.margin}>
          <CartesianGrid {...chartDefaults.cartesianGrid} />
          <XAxis dataKey="label" {...chartDefaults.axis} />
          <YAxis {...chartDefaults.axis} width={36} />
          <Tooltip
            {...chartDefaults.tooltip}
            formatter={(value) => [valueFormatter(Number(value)), title]}
          />
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
    </ChartShell>
  );
}
