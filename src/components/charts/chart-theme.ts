/** Recharts theme tokens — restrained 2-tone palette */

export const chartColors = {
  primary: "var(--accent-on-track)",
  secondary: "var(--accent-muted)",
  muted: "var(--text-muted)",
  text: "var(--text-secondary)",
  grid: "var(--border-color)",
  surface: "var(--bg-surface)",
  missed: "var(--accent-missed)",
} as const;

export const chartSeries = [
  "var(--accent-on-track)",
  "var(--accent-muted)",
  "var(--accent-missed)",
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
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-color)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text-primary)",
      fontSize: 12,
    },
    labelStyle: { color: chartColors.text },
  },
} as const;

export function seriesColor(index: number): string {
  return chartSeries[index % chartSeries.length];
}
