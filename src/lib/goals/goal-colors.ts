/** Consistent goal accents — purple, teal, amber only (no rainbow). */

export const GOAL_ACCENTS = ["#7c6fff", "#2dd4bf", "#fbbf24"] as const;

export const GOAL_ACCENT_VARS = [
  "var(--goal-accent-0)",
  "var(--goal-accent-1)",
  "var(--goal-accent-2)",
] as const;

export function goalAccent(index: number): string {
  return GOAL_ACCENTS[Math.abs(index) % GOAL_ACCENTS.length];
}

export function goalAccentVar(index: number): string {
  return GOAL_ACCENT_VARS[Math.abs(index) % GOAL_ACCENT_VARS.length];
}

export function goalAccentClass(index: number): string {
  return `goal-accent-${Math.abs(index) % GOAL_ACCENTS.length}`;
}
