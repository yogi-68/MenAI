/**
 * Rule-based goal pace insight — no LLM.
 */

export function buildGoalPaceInsight(input: {
  targetDate: string | null;
  remainingDays: number | null;
  progress: number;
  dailyProgressNeeded: number | null;
  dailyTrend: Array<{ completed: number; score: number }>;
  estimatedCompletionDate: string | null;
  tasksCompletedTotal: number;
}): string {
  if (!input.targetDate) {
    return "Add a deadline in Coach — Mettle can't calculate required pace without one.";
  }

  if (input.remainingDays != null && input.remainingDays <= 0) {
    return "Deadline passed — update your target date or narrow scope with Coach.";
  }

  const daysLeft = input.remainingDays ?? 0;
  const last7 = input.dailyTrend.slice(-7);
  const totalTasks7d = last7.reduce((s, d) => s + d.completed, 0);
  const activeDays = last7.filter((d) => d.completed > 0).length;
  const tasksPerDay = activeDays > 0 ? totalTasks7d / activeDays : 0;
  const minTasksPerDay = Math.max(1, Math.ceil((100 - input.progress) / Math.max(daysLeft, 1) / 10));

  if (input.estimatedCompletionDate && input.targetDate) {
    const est = new Date(input.estimatedCompletionDate);
    const tgt = new Date(input.targetDate);
    est.setHours(0, 0, 0, 0);
    tgt.setHours(0, 0, 0, 0);
    const missBy = Math.ceil((est.getTime() - tgt.getTime()) / 86400000);
    if (missBy > 0 && tasksPerDay < minTasksPerDay) {
      return `At ${tasksPerDay.toFixed(1)} tasks/day you'll miss the deadline by ${missBy} days. Minimum ${minTasksPerDay} tasks/day required.`;
    }
  }

  if (input.dailyProgressNeeded != null && input.dailyProgressNeeded > 0) {
    const avgScore =
      last7.length > 0 ? last7.reduce((s, d) => s + d.score, 0) / last7.length : 0;
    if (avgScore < input.dailyProgressNeeded * 0.6) {
      return `Pace is behind — you need ~${input.dailyProgressNeeded.toFixed(1)}% progress/day with ${daysLeft} days left.`;
    }
  }

  if (tasksPerDay >= minTasksPerDay) {
    return `On track at ~${tasksPerDay.toFixed(1)} tasks/day. Keep finishing before noon when possible.`;
  }

  return `Minimum ${minTasksPerDay} tasks/day required to hit your deadline with ${daysLeft} days left.`;
}
