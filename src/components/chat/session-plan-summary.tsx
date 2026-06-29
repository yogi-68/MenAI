"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { ClayCard } from "@/components/ui";

export function SessionPlanSummary() {
  const [open, setOpen] = useState(true);

  const { data: snapshot } = useQuery({
    queryKey: ["coach-snapshot"],
    queryFn: async () => {
      const res = await fetch("/api/coach/snapshot");
      if (!res.ok) return null;
      return res.json() as Promise<{
        tasksCompletedToday: number;
        tasksDueToday: number;
        phase: string;
      }>;
    },
    staleTime: 30_000,
  });

  const { data: tasks } = useQuery({
    queryKey: ["today-tasks-summary"],
    queryFn: async () => {
      const res = await fetch("/api/tasks?dueDate=today&status=all");
      if (!res.ok) return [];
      const json = await res.json();
      return (json.tasks || []) as Array<{ id: string; title: string; status: string }>;
    },
    staleTime: 15_000,
  });

  const due = snapshot?.tasksDueToday ?? tasks?.length ?? 0;
  const done = snapshot?.tasksCompletedToday ?? tasks?.filter((t) => t.status === "completed").length ?? 0;

  if (due === 0) return null;

  return (
    <ClayCard className="mx-4 mt-3 p-3 md:mx-6" hover={false}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
      >
        <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          <ListChecks size={16} style={{ color: "var(--accent-primary)" }} />
          Today&apos;s plan · {done}/{due} complete
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5 m-0 pl-0 list-none text-xs" style={{ color: "var(--text-secondary)" }}>
          {(tasks ?? []).slice(0, 9).map((t) => (
            <li key={t.id} className="flex items-start gap-2">
              <span style={{ color: t.status === "completed" ? "var(--accent-success)" : "var(--text-muted)" }}>
                {t.status === "completed" ? "✓" : "○"}
              </span>
              <span className={t.status === "completed" ? "line-through opacity-70" : undefined}>{t.title}</span>
            </li>
          ))}
        </ul>
      )}
    </ClayCard>
  );
}
