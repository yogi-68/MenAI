/** Recharts theme tokens — restrained purple + muted palette */

export const chartColors = {
  primary: "var(--accent-primary)",
  secondary: "var(--accent-muted)",
  muted: "var(--text-muted)",
  text: "var(--text-secondary)",
  grid: "var(--border-color)",
  surface: "var(--bg-surface)",
  missed: "var(--accent-missed)",
  highScore: "var(--accent-primary)",
  lowScore: "rgba(255,255,255,0.12)",
} as const;

export const chartSeries = [
  "var(--accent-primary)",
  "var(--goal-accent-1)",
  "var(--goal-accent-2)",
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
      border: "0.5px solid var(--border-color)",
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

/** Bar color for daily score — purple when strong, grey when low */
export function dailyScoreBarColor(value: number): string {
  return value >= 50 ? chartColors.highScore : chartColors.lowScore;
}
