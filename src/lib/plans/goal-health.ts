export type GoalHealth = "on_track" | "at_risk" | "stalled" | "completed";

export interface GoalHealthInput {
  status: string;
  targetDate?: string | null;
  lastActionAt?: string | null;
  progress?: number;
}

export interface GoalHealthResult {
  health: GoalHealth;
  label: string;
  daysUntilDeadline: number | null;
  daysSinceLastAction: number | null;
  reason: string;
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from);
  const b = new Date(to);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeGoalHealth(
  input: GoalHealthInput,
  now = new Date()
): GoalHealthResult {
  if (input.status === "completed") {
    return {
      health: "completed",
      label: "Completed",
      daysUntilDeadline: null,
      daysSinceLastAction: null,
      reason: "Goal marked complete",
    };
  }

  const daysSinceLastAction = input.lastActionAt
    ? daysBetween(new Date(input.lastActionAt), now)
    : null;

  const daysUntilDeadline = input.targetDate
    ? daysBetween(now, new Date(input.targetDate))
    : null;

  if (daysSinceLastAction !== null && daysSinceLastAction >= 14) {
    return {
      health: "stalled",
      label: "Stalled",
      daysUntilDeadline,
      daysSinceLastAction,
      reason: `No action in ${daysSinceLastAction} days`,
    };
  }

  const atRiskByDeadline =
    daysUntilDeadline !== null &&
    daysUntilDeadline <= 14 &&
    (daysSinceLastAction === null || daysSinceLastAction >= 5);

  const atRiskByInactivity =
    daysSinceLastAction !== null && daysSinceLastAction >= 7;

  if (atRiskByDeadline || atRiskByInactivity) {
    if (atRiskByInactivity && !atRiskByDeadline) {
      return {
        health: "at_risk",
        label: "At Risk",
        daysUntilDeadline,
        daysSinceLastAction,
        reason: `No meaningful progress in ${daysSinceLastAction} days.`,
      };
    }
    const parts: string[] = [];
    if (atRiskByInactivity) parts.push(`No meaningful progress in ${daysSinceLastAction} days`);
    if (daysUntilDeadline !== null && daysUntilDeadline <= 14)
      parts.push(`${daysUntilDeadline} days to deadline`);
    return {
      health: "at_risk",
      label: "At Risk",
      daysUntilDeadline,
      daysSinceLastAction,
      reason: parts.join(". ") + (parts.length ? "." : ""),
    };
  }

  return {
    health: "on_track",
    label: "On Track",
    daysUntilDeadline,
    daysSinceLastAction,
    reason:
      daysSinceLastAction !== null
        ? `Active within ${daysSinceLastAction} days`
        : "Recently started or no actions logged yet",
  };
}

export function healthColor(health: GoalHealth): string {
  switch (health) {
    case "on_track":
      return "var(--accent-primary)";
    case "at_risk":
      return "#f59e0b";
    case "stalled":
      return "#ef4444";
    case "completed":
      return "var(--text-muted)";
  }
}
