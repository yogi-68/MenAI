/** Reject self-help phase labels — milestones must sound finishable and measurable. */

const ABSTRACT_PATTERNS = [
  /\b(development|assessment|tracking)\b/i,
  /\b(goal setting|nutrition plan|training program|progress tracking)\b/i,
  /\b(structured|consistency and|establish|framework|foundation)\b/i,
  /\b(plan|routine|program)\s*(development|design|creation)?\b/i,
  /\bbuild (a )?(routine|habit|system|framework)\b/i,
  /\bdefine (the )?(outcome|vision|strategy)\b/i,
];

const CONCRETE_SIGNALS = [
  /^\d+/,
  /\b\d+\s*(kg|lb|%|workout|session|day|week|user|customer|email|minute|hour|page|mcq)/i,
  /^(record|log|complete|lose|reach|send|create|finish|buy|calculate|message|publish|ship|pass|hire|sign|walk|run|submit|draft|write|call|meet|track)/i,
  /\breach \d/i,
  /\bfirst \d/i,
  /\blost? first/i,
];

export function isAbstractMilestone(title: string): boolean {
  const t = title.trim();
  if (t.length < 8) return true;
  if (CONCRETE_SIGNALS.some((p) => p.test(t))) return false;
  if (ABSTRACT_PATTERNS.some((p) => p.test(t))) return true;
  // Category-style titles without verbs
  if (!/^(record|log|complete|lose|reach|send|create|finish|buy|calculate|message|publish|ship|pass|hire|sign|walk|run|submit|draft|write|call|meet|get|track|set up|build \d)/i.test(t)) {
    if (/\b(and|&)\b/.test(t) && t.split(/\s+/).length <= 6) return true;
  }
  return false;
}

export function passesMilestoneQualityGate(title: string): boolean {
  return !isAbstractMilestone(title);
}

export function filterConcreteMilestones(titles: string[]): string[] {
  return titles.filter((t) => passesMilestoneQualityGate(t.trim())).map((t) => t.trim());
}

/** Progress hint from milestone title + completed initiative tasks. */
export function milestoneProgressLabel(
  milestoneTitle: string,
  completedTaskCount: number
): string {
  const workout = milestoneTitle.match(/(\d+)\s*(workout|training session|session)/i);
  if (workout) {
    const target = Number(workout[1]);
    return `${Math.min(completedTaskCount, target)} / ${target} sessions completed`;
  }
  const days = milestoneTitle.match(/(\d+)\s*days?/i);
  if (days) {
    const target = Number(days[1]);
    return `${Math.min(completedTaskCount, target)} / ${target} days logged`;
  }
  const kg = milestoneTitle.match(/(\d+(?:\.\d+)?)\s*kg/i);
  if (kg) {
    return completedTaskCount > 0
      ? `${completedTaskCount} supporting tasks done toward ${kg[1]} kg target`
      : "Weigh in and log starting point";
  }
  if (completedTaskCount > 0) {
    return `${completedTaskCount} task${completedTaskCount === 1 ? "" : "s"} completed toward this milestone`;
  }
  return "No tasks completed toward this milestone yet";
}

export const MILESTONE_QUALITY_PROMPT = `
MILESTONE QUALITY — each milestone must pass the "can I do or measure this?" test:
- BAD (abstract phases): "Assessment and Goal Setting", "Nutrition Plan Development", "Structured Training Program", "Consistency and Progress Tracking"
- GOOD (concrete): "Record weight and waist measurement", "Create daily 2,200-calorie meal plan", "Complete first 10 workouts", "Lose first 2 kg", "Reach 15% body fat"
- Use numbers, verbs, and measurable outcomes — never chapter titles from a self-help book.
- Each milestone should be completable in days to a few weeks, not an eternal category.
`.trim();
