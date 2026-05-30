import type { LifeArea } from "@/lib/plans/life-areas";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExecutionRateSnapshot {
  rate: number;
  completed: number;
  total: number;
}

export interface ExecutionMetrics {
  last7Days: ExecutionRateSnapshot;
  last30Days: ExecutionRateSnapshot;
  byLifeArea: Array<ExecutionRateSnapshot & { area: LifeArea; label: string }>;
  byInitiative: Array<
    ExecutionRateSnapshot & { initiativeId: string; title: string; lifeArea: string }
  >;
}

function computeRate(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

export async function fetchExecutionMetrics(
  supabase: SupabaseClient,
  userId: string
): Promise<ExecutionMetrics> {
  const now = new Date();
  const d7 = new Date(now);
  d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now);
  d30.setDate(d30.getDate() - 30);
  const since30 = d30.toISOString().split("T")[0];

  const { data: plannedTasks } = await supabase
    .from("tasks")
    .select("id, status, due_date, initiative_id, initiatives(id, title, life_area)")
    .eq("user_id", userId)
    .eq("auto_generated", true)
    .gte("due_date", since30)
    .not("due_date", "is", null);

  const tasks = plannedTasks || [];

  function snapshotForDays(days: number): ExecutionRateSnapshot {
    const since = new Date(now);
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];
    const subset = tasks.filter((t) => t.due_date && t.due_date >= sinceStr);
    const completed = subset.filter((t) => t.status === "completed").length;
    return {
      rate: computeRate(completed, subset.length),
      completed,
      total: subset.length,
    };
  }

  const areaMap = new Map<string, { completed: number; total: number; label: string }>();
  const initMap = new Map<
    string,
    { completed: number; total: number; title: string; lifeArea: string }
  >();

  for (const task of tasks) {
    const init = task.initiatives as {
      id?: string;
      title?: string;
      life_area?: string;
    } | null;
    const area = init?.life_area || "personal";
    const areaBucket = areaMap.get(area) ?? { completed: 0, total: 0, label: area };
    areaBucket.total += 1;
    if (task.status === "completed") areaBucket.completed += 1;
    areaMap.set(area, areaBucket);

    if (init?.id && task.initiative_id) {
      const ib = initMap.get(task.initiative_id) ?? {
        completed: 0,
        total: 0,
        title: init.title || "Initiative",
        lifeArea: area,
      };
      ib.total += 1;
      if (task.status === "completed") ib.completed += 1;
      initMap.set(task.initiative_id, ib);
    }
  }

  return {
    last7Days: snapshotForDays(7),
    last30Days: snapshotForDays(30),
    byLifeArea: [...areaMap.entries()].map(([area, b]) => ({
      area: area as LifeArea,
      label: area,
      rate: computeRate(b.completed, b.total),
      completed: b.completed,
      total: b.total,
    })),
    byInitiative: [...initMap.entries()].map(([initiativeId, b]) => ({
      initiativeId,
      title: b.title,
      lifeArea: b.lifeArea,
      rate: computeRate(b.completed, b.total),
      completed: b.completed,
      total: b.total,
    })),
  };
}
