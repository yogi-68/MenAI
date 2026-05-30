export interface DashboardTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  auto_generated?: boolean | null;
  created_at?: string;
}

const LEGACY_GENERIC = /^(make progress on:|progress on:|complete 1 key milestone for:|take 1 financial action for:)/i;

export function isLegacyGenericTask(title: string): boolean {
  return LEGACY_GENERIC.test(title.trim());
}

/** Pick up to 4 tasks for overview: today's plan first, no legacy duplicates. */
export function selectDashboardTasks(tasks: DashboardTask[], today: string, limit = 4): DashboardTask[] {
  const todayTasks = tasks.filter((t) => t.due_date === today);
  const planTasks = todayTasks.filter((t) => t.auto_generated);
  const source =
    planTasks.length > 0
      ? planTasks
      : todayTasks.length > 0
        ? todayTasks
        : tasks.filter((t) => !isLegacyGenericTask(t.title) || Boolean(t.auto_generated));

  const sorted = [...source].sort((a, b) => {
    if (a.due_date === today && b.due_date !== today) return -1;
    if (b.due_date === today && a.due_date !== today) return 1;
    if (a.auto_generated && !b.auto_generated) return -1;
    if (b.auto_generated && !a.auto_generated) return 1;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  const seen = new Set<string>();
  const result: DashboardTask[] = [];
  for (const task of sorted) {
    const key = task.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(task);
    if (result.length >= limit) break;
  }
  return result;
}

export function formatLatestReflection(row: {
  moved_forward: string;
  blocked_by?: string | null;
  reflection_date: string;
}): string {
  const date = new Date(row.reflection_date + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${date}: ${row.moved_forward.trim()}`;
}
