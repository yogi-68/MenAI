/** Recharts theme tokens — reads from CSS design variables */

export const chartColors = {
  primary: "var(--accent-primary)",
  secondary: "var(--accent-secondary)",
  muted: "var(--text-muted)",
  text: "var(--text-secondary)",
  grid: "var(--border-color)",
  surface: "var(--bg-glass)",
} as const;

export const chartSeries = [
  "var(--accent-primary)",
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
] as const;

export const chartDefaults = {
  margin: { top: 8, right: 8, left: -16, bottom: 0 },
  cartesianGrid: {
    strokeDasharray: "3 3",
    stroke: chartColors.grid,
    vertical: false,
  },
  axis: {
    tick: { fill: chartColors.muted, fontSize: 11 },
    axisLine: { stroke: chartColors.grid },
    tickLine: false,
  },
  tooltip: {
    contentStyle: {
      background: "var(--bg-card)",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-primary)",
      fontSize: 12,
      boxShadow: "var(--shadow-md)",
    },
    labelStyle: { color: "var(--text-secondary)" },
  },
} as const;

export function seriesColor(index: number): string {
  return chartSeries[index % chartSeries.length];
}
