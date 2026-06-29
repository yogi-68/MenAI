"use client";

interface MilestoneStep {
  id: string;
  title: string;
  status: string;
}

const STATUS_STYLE: Record<string, { dot: string; line: string }> = {
  completed: { dot: "var(--accent-success)", line: "var(--accent-success)" },
  in_progress: { dot: "var(--accent-primary)", line: "var(--accent-primary)" },
  pending: { dot: "var(--text-muted)", line: "var(--border-subtle)" },
};

export function MilestoneRoadmap({ milestones }: { milestones: MilestoneStep[] }) {
  if (milestones.length === 0) {
    return (
      <p className="text-sm m-0" style={{ color: "var(--text-muted)" }}>
        No milestones yet — they appear after onboarding or in Coach.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-start min-w-max gap-0">
        {milestones.map((m, i) => {
          const style = STATUS_STYLE[m.status] ?? STATUS_STYLE.pending;
          const isLast = i === milestones.length - 1;
          return (
            <div key={m.id} className="flex items-start" style={{ minWidth: 120, maxWidth: 160 }}>
              <div className="flex flex-col items-center flex-1 px-2">
                <div
                  className="rounded-full shrink-0"
                  style={{
                    width: 10,
                    height: 10,
                    background: style.dot,
                    boxShadow: m.status === "in_progress" ? `0 0 0 3px color-mix(in srgb, ${style.dot} 25%, transparent)` : undefined,
                  }}
                />
                <p
                  className="text-[11px] text-center m-0 mt-2 leading-snug"
                  style={{
                    color: m.status === "completed" ? "var(--text-secondary)" : "var(--text-primary)",
                    fontWeight: m.status === "in_progress" ? 600 : 400,
                  }}
                >
                  {m.title}
                </p>
              </div>
              {!isLast && (
                <div
                  className="shrink-0 mt-1"
                  style={{
                    width: 32,
                    height: 2,
                    background: milestones[i + 1]?.status === "completed" ? style.line : "var(--border-subtle)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
