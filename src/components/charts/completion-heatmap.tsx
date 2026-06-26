"use client";

interface HeatmapCell {
  date: string;
  count: number;
}

interface CompletionHeatmapProps {
  cells: HeatmapCell[];
  weeks?: number;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function levelColor(count: number): string {
  if (count >= 3) return "#7c6fff";
  if (count === 2) return "rgba(124, 111, 255, 0.6)";
  if (count === 1) return "rgba(124, 111, 255, 0.3)";
  return "rgba(124, 111, 255, 0.06)";
}

function formatTooltip(date: string, count: number): string {
  const label = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const taskWord = count === 1 ? "task" : "tasks";
  return `${label} — ${count} ${taskWord} completed`;
}

export function CompletionHeatmap({ cells, weeks = 8 }: CompletionHeatmapProps) {
  const byDate = new Map(cells.map((c) => [c.date, c.count]));
  const grid: Array<{ date: string; count: number; day: number; weekStart: string }> = [];

  for (let w = weeks - 1; w >= 0; w--) {
    let weekStart = "";
    for (let d = 0; d < 7; d++) {
      const date = new Date();
      date.setDate(date.getDate() - w * 7 - (6 - d));
      const key = date.toISOString().split("T")[0];
      if (d === 0) weekStart = key;
      grid.push({ date: key, count: byDate.get(key) ?? 0, day: d, weekStart });
    }
  }

  const totalCompleted = grid.reduce((s, c) => s + c.count, 0);

  if (totalCompleted === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 px-4 text-center"
        style={{ minHeight: 120 }}
      >
        <div
          className="grid gap-1 mb-3 opacity-30"
          style={{ gridTemplateColumns: "repeat(7, 12px)" }}
        >
          {Array.from({ length: 21 }).map((_, i) => (
            <div
              key={i}
              className="rounded-sm"
              style={{ width: 12, height: 12, background: "rgba(124, 111, 255, 0.15)" }}
            />
          ))}
        </div>
        <p className="text-xs m-0" style={{ color: "var(--text-muted)" }}>
          Complete tasks to see your completion pattern
        </p>
      </div>
    );
  }

  const weekRows: Array<typeof grid> = [];
  for (let i = 0; i < grid.length; i += 7) {
    weekRows.push(grid.slice(i, i + 7));
  }

  return (
    <div>
      <div className="mb-2 flex gap-1 pl-8">
        {DAY_LETTERS.map((l, i) => (
          <span
            key={`${l}-${i}`}
            className="text-center text-[10px]"
            style={{ width: 14, color: "var(--text-muted)" }}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {weekRows.map((row) => (
          <div key={row[0]?.weekStart} className="flex items-center gap-1">
            <span
              className="text-[10px] shrink-0 w-7"
              style={{ color: "var(--text-muted)" }}
            >
              {new Date(row[0].weekStart + "T12:00:00").toLocaleDateString("en-US", {
                month: "short",
              })}
            </span>
            <div className="flex gap-1 flex-1">
              {row.map((cell) => (
                <div
                  key={cell.date}
                  title={formatTooltip(cell.date, cell.count)}
                  className="aspect-square flex-1 rounded-sm max-w-[14px]"
                  style={{ background: levelColor(cell.count), minHeight: 12 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
