export interface DataQualityIssue {
  type: "missing_deadline" | "no_tasks" | "duplicate_title" | "missing_reflection";
  entity: "initiative" | "goal" | "task" | "reflection";
  id?: string;
  message: string;
}

export function auditInitiatives(
  initiatives: Array<{ id: string; title: string; target_date: string | null; status: string }>,
  taskCounts: Map<string, number>
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const titles = new Map<string, number>();

  for (const init of initiatives) {
    if (init.status !== "active") continue;

    const key = init.title.trim().toLowerCase();
    titles.set(key, (titles.get(key) ?? 0) + 1);

    if (!init.target_date) {
      issues.push({
        type: "missing_deadline",
        entity: "initiative",
        id: init.id,
        message: `"${init.title}" has no deadline — add one so the planner can prioritize.`,
      });
    }

    const count = taskCounts.get(init.id) ?? 0;
    if (count === 0) {
      issues.push({
        type: "no_tasks",
        entity: "initiative",
        id: init.id,
        message: `"${init.title}" has no linked tasks yet.`,
      });
    }
  }

  for (const [title, n] of titles) {
    if (n > 1) {
      issues.push({
        type: "duplicate_title",
        entity: "initiative",
        message: `Duplicate initiative title: "${title}" — merge or rename.`,
      });
    }
  }

  return issues;
}
