"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartShell } from "@/components/ui";
import { chartColors, chartDefaults, seriesColor } from "./chart-theme";

export interface AreaChartPoint {
  label: string;
  value: number;
  [key: string]: string | number;
}

interface AreaChartCardProps {
  title: string;
  subtitle?: string;
  data: AreaChartPoint[];
  dataKey?: string;
  loading?: boolean;
  height?: number;
  action?: React.ReactNode;
  valueFormatter?: (v: number) => string;
  className?: string;
}

export function AreaChartCard({
  title,
  subtitle,
  data,
  dataKey = "value",
  loading,
  height = 220,
  action,
  valueFormatter = (v) => String(v),
  className,
}: AreaChartCardProps) {
  return (
    <ChartShell title={title} subtitle={subtitle} loading={loading} action={action} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={chartDefaults.margin}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(0)} stopOpacity={0.35} />
              <stop offset="100%" stopColor={seriesColor(0)} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...chartDefaults.cartesianGrid} />
          <XAxis dataKey="label" {...chartDefaults.axis} />
          <YAxis {...chartDefaults.axis} width={36} />
          <Tooltip
            {...chartDefaults.tooltip}
            formatter={(value) => [valueFormatter(Number(value)), title]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={seriesColor(0)}
            strokeWidth={2}
            fill="url(#areaFill)"
            dot={false}
            activeDot={{ r: 4, fill: chartColors.primary }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
