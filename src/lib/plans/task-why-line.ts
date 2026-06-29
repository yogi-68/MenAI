const NULL_MILESTONE_PATTERNS = [
  /^no milestones yet$/i,
  /^none$/i,
  /^not set$/i,
  /^unknown$/i,
  /^n\/a$/i,
];

const NULL_WHY_PATTERNS = [
  /no milestones yet/i,
  /current milestone:\s*no milestones/i,
  /milestone:\s*no milestones/i,
];

export function sanitizeMilestoneLabel(milestone?: string | null): string | null {
  if (!milestone?.trim()) return null;
  const label = milestone.trim();
  if (NULL_MILESTONE_PATTERNS.some((pattern) => pattern.test(label))) return null;
  return label;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isDuplicateText(candidate: string, reference: string): boolean {
  if (!candidate || !reference) return false;
  return normalize(candidate) === normalize(reference);
}

function containsNullFallback(text: string): boolean {
  return NULL_WHY_PATTERNS.some((pattern) => pattern.test(text));
}

export interface TaskWhyInput {
  title: string;
  whyItMatters?: string;
  linkedMilestone?: string;
  linkedInitiative?: string;
  description?: string;
}

export interface TaskWhyOptions {
  /** Recent win or identity hook from user model */
  momentumHook?: string | null;
}

/** Three-tier why line — never expose raw null milestone labels or duplicate the title. */
export function buildTaskWhyLine(task: TaskWhyInput, options: TaskWhyOptions = {}): string {
  const goalName = task.linkedInitiative?.trim() || "your goal";
  const milestone = sanitizeMilestoneLabel(task.linkedMilestone);
  const why = task.whyItMatters?.trim() || "";
  const title = task.title.trim();

  if (
    why &&
    !containsNullFallback(why) &&
    !isDuplicateText(why, title) &&
    !isDuplicateText(why, task.description || "")
  ) {
    if (milestone && normalize(why).includes(normalize(milestone))) {
      return why;
    }
    if (!milestone) {
      return why;
    }
    if (!why.toLowerCase().startsWith("milestone:")) {
      return why;
    }
  }

  if (milestone) {
    if (options.momentumHook) {
      return `${options.momentumHook} — next step: ${milestone}.`;
    }
    return `Moves you toward "${milestone}" on ${goalName}.`;
  }

  if (options.momentumHook) {
    return `${options.momentumHook} — building momentum on ${goalName}.`;
  }

  return `First step toward ${goalName} — building early momentum.`;
}

export function sanitizePlanTaskFields<T extends TaskWhyInput>(
  task: T,
  options: TaskWhyOptions = {}
): T & { whyItMatters: string; linkedMilestone?: string } {
  const milestone = sanitizeMilestoneLabel(task.linkedMilestone);
  return {
    ...task,
    linkedMilestone: milestone ?? undefined,
    whyItMatters: buildTaskWhyLine(
      { ...task, linkedMilestone: milestone ?? undefined },
      options
    ),
  };
}

export function trimKnowledgeBullet(text: string, maxWords = 8): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

export function formatKnowledgeBulletsForRail(
  bullets: string[],
  maxItems = 4,
  maxWords = 8
): string[] {
  return bullets
    .map((item) => trimKnowledgeBullet(item, maxWords))
    .filter(Boolean)
    .slice(0, maxItems);
}
