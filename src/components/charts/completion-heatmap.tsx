"use client";

interface HeatmapCell {
  date: string;
  count: number;
}

interface CompletionHeatmapProps {
  cells: HeatmapCell[];
  weeks?: number;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function levelColor(count: number): string {
  if (count >= 3) return "var(--accent-primary)";
  if (count === 2) return "rgba(124, 111, 255, 0.55)";
  if (count === 1) return "rgba(124, 111, 255, 0.25)";
  return "var(--bg-secondary)";
}

export function CompletionHeatmap({ cells, weeks = 8 }: CompletionHeatmapProps) {
  const byDate = new Map(cells.map((c) => [c.date, c.count]));
  const grid: Array<{ date: string; count: number; day: number }> = [];

  for (let w = weeks - 1; w >= 0; w--) {
    for (let d = 0; d < 7; d++) {
      const date = new Date();
      date.setDate(date.getDate() - w * 7 - (6 - d));
      const key = date.toISOString().split("T")[0];
      grid.push({ date: key, count: byDate.get(key) ?? 0, day: d });
    }
  }

  return (
    <div>
      <div className="mb-2 flex justify-between text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {DAY_LABELS.map((l) => (
          <span key={l} className="w-4 text-center">
            {l[0]}
          </span>
        ))}
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {grid.map((cell) => (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.count} completed`}
            className="aspect-square rounded-sm"
            style={{ background: levelColor(cell.count) }}
          />
        ))}
      </div>
    </div>
  );
}
