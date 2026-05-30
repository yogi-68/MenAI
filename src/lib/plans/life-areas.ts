export const LIFE_AREAS = [
  { value: "career", label: "Career" },
  { value: "business", label: "Business" },
  { value: "finance", label: "Finance" },
  { value: "health", label: "Health" },
  { value: "learning", label: "Learning" },
  { value: "relationships", label: "Relationships" },
  { value: "personal", label: "Personal" },
] as const;

export type LifeArea = (typeof LIFE_AREAS)[number]["value"];

export function lifeAreaLabel(area: string): string {
  return LIFE_AREAS.find((a) => a.value === area)?.label ?? area;
}

export interface LifeAreaBalance {
  area: LifeArea;
  label: string;
  plannedTasks: number;
  completedTasks: number;
  attentionPct: number;
  daysSinceAction: number | null;
}

export function computeLifeAreaBalance(
  rows: Array<{
    life_area: string;
    status: string;
    completed_at?: string | null;
    due_date?: string | null;
  }>,
  days = 14
): LifeAreaBalance[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const byArea = new Map<string, { planned: number; completed: number; lastAction: number | null }>();

  for (const area of LIFE_AREAS) {
    byArea.set(area.value, { planned: 0, completed: 0, lastAction: null });
  }

  for (const row of rows) {
    const area = row.life_area || "personal";
    const bucket = byArea.get(area) ?? { planned: 0, completed: 0, lastAction: null };
    bucket.planned += 1;
    if (row.status === "completed") {
      bucket.completed += 1;
      if (row.completed_at) {
        const ts = new Date(row.completed_at).getTime();
        if (ts >= since && (!bucket.lastAction || ts > bucket.lastAction)) {
          bucket.lastAction = ts;
        }
      }
    }
    byArea.set(area, bucket);
  }

  const totalPlanned = [...byArea.values()].reduce((s, b) => s + b.planned, 0) || 1;

  return LIFE_AREAS.map(({ value, label }) => {
    const b = byArea.get(value)!;
    return {
      area: value,
      label,
      plannedTasks: b.planned,
      completedTasks: b.completed,
      attentionPct: Math.round((b.planned / totalPlanned) * 100),
      daysSinceAction: b.lastAction
        ? Math.floor((Date.now() - b.lastAction) / (1000 * 60 * 60 * 24))
        : null,
    };
  });
}

export function formatBalanceInsight(balance: LifeAreaBalance[]): string | null {
  const active = balance.filter((b) => b.plannedTasks > 0 || b.completedTasks > 0);
  if (active.length === 0) return null;

  const top = [...active].sort((a, b) => b.attentionPct - a.attentionPct)[0];
  const neglected = balance.filter(
    (b) => b.daysSinceAction === null && b.plannedTasks === 0 && b.completedTasks === 0
  );

  if (top.attentionPct >= 70 && neglected.length > 0) {
    const names = neglected.slice(0, 2).map((b) => b.label).join(" and ");
    return `${top.label} is receiving ${top.attentionPct}% of your attention while ${names} ${neglected.length === 1 ? "has" : "have"} had no completed actions in 14 days.`;
  }

  const stale = balance.filter((b) => b.daysSinceAction !== null && b.daysSinceAction >= 14);
  if (stale.length > 0) {
    return `${stale[0].label} has had no completed actions in ${stale[0].daysSinceAction} days.`;
  }

  return null;
}
