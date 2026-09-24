/**
 * Intake.
 *
 * Deliberately short. This is a mental performance coach, and people disclose
 * how their mind works *after* the product has proved useful, not before — a
 * long intake ahead of any value is the fastest way to lose someone. Depth
 * comes from the adaptive interview (see plan-context-dimensions.ts), which
 * asks the single highest-value question over time, forever.
 *
 * What intake must establish, and nothing more:
 *   a concrete goal → a deadline → what gets in the way → what success means
 *   → how much time there is → a state baseline → what drains you.
 *
 * The last two are what make this a performance coach rather than a task
 * list: they let the first plan be sized against capacity on day one.
 */

export interface OnboardingQuestion {
  id: string;
  type: "text" | "forced_choice" | "scale";
  prompt: string;
  subtitle?: string;
  options?: Array<{ value: string; label: string }>;
  allowMultiple?: boolean;
  allowOther?: boolean;
  optional?: boolean;
  otherPrompt?: string;
  /** For `scale` questions. */
  min?: number;
  max?: number;
  labels?: { min: string; max: string };
}

export const ONBOARDING_QUESTIONS: Record<string, OnboardingQuestion> = {
  Q1: {
    id: "Q1",
    type: "text",
    prompt: "What are you actively trying to achieve in the next 30–90 days?",
    subtitle:
      "Something concrete — ship the beta, get five clients, lose 5kg. Not a direction like 'be more disciplined'.",
  },
  Q2: {
    id: "Q2",
    type: "forced_choice",
    prompt: "When do you want it done?",
    options: [
      { value: "30", label: "30 days" },
      { value: "60", label: "60 days" },
      { value: "90", label: "90 days" },
      { value: "custom", label: "A specific date" },
      { value: "flexible", label: "No fixed date yet" },
    ],
  },
  Q3: {
    id: "Q3",
    type: "forced_choice",
    prompt: "What gets in the way most?",
    subtitle: "The honest answer, not the flattering one.",
    options: [
      { value: "overthinking", label: "Overthinking it" },
      { value: "procrastination", label: "Putting it off" },
      { value: "burnout", label: "Running on empty" },
      { value: "scattered_focus", label: "Not knowing where to start" },
      { value: "scattered_focus_priorities", label: "Too many things at once" },
      { value: "lack_of_time", label: "No time" },
      { value: "avoidance", label: "Fear of it not working" },
      { value: "inconsistency", label: "Starting, then stopping" },
    ],
    allowOther: true,
    otherPrompt: "What else tends to get in the way?",
  },
  Q4: {
    id: "Q4",
    type: "text",
    prompt: "What would make the next 30 days a success?",
    subtitle: "Put a number on it if you can — ship the beta · lose 3kg · first paying client.",
  },
  Q5: {
    id: "Q5",
    type: "forced_choice",
    prompt: "How many hours a week can you realistically give this?",
    subtitle: "Be honest rather than aspirational. Your plan gets sized from this.",
    options: [
      { value: "1-5", label: "1–5 hours" },
      { value: "5-10", label: "5–10 hours" },
      { value: "10-20", label: "10–20 hours" },
      { value: "20+", label: "20+ hours" },
    ],
  },
  Q6: {
    id: "Q6",
    type: "scale",
    prompt: "Where are you today?",
    subtitle:
      "Your baseline. We'll ask this each day — it's how the plan learns to match the work to the capacity you actually have.",
    min: 1,
    max: 10,
    labels: { min: "Depleted", max: "Sharp" },
  },
  Q7: {
    id: "Q7",
    type: "forced_choice",
    prompt: "What drains you fastest?",
    subtitle: "Knowing this is how we keep your hardest work away from your worst hours.",
    options: [
      { value: "meetings", label: "Back-to-back meetings" },
      { value: "context_switching", label: "Switching between things" },
      { value: "ambiguity", label: "Not knowing what's expected" },
      { value: "conflict", label: "Friction with people" },
      { value: "poor_sleep", label: "Bad sleep" },
      { value: "long_hours", label: "Long stretches without a break" },
      { value: "admin", label: "Admin and busywork" },
    ],
    allowOther: true,
    otherPrompt: "What drains you that isn't listed?",
  },
};

export type OnboardingResponseMap = Record<
  string,
  { response?: string | null; responseData?: { selected?: string | string[] } }
>;

export const ONBOARDING_STEP_LABELS = [
  "Goal",
  "Deadline",
  "Obstacle",
  "Success",
  "Time",
  "State",
  "Drain",
] as const;

const BASE_FLOW = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"] as const;

/** The value a forced-choice answer selected, if any. */
function selectedValue(entry: OnboardingResponseMap[string] | undefined): string | null {
  const selected = entry?.responseData?.selected;
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected ?? entry?.response ?? null;
}

/**
 * The question order for this user.
 *
 * Branches on what has already been answered. The previous implementation
 * accepted a `_responses` argument, ignored it, and returned a hardcoded
 * array — the parameter was threaded through four call sites and the UI
 * without ever doing anything.
 */
export function buildQuestionFlow(responses: OnboardingResponseMap = {}): string[] {
  const flow: string[] = [...BASE_FLOW];

  // Someone already running on empty has told us what we would have asked.
  // Pressing on with "what drains you fastest" reads as not listening.
  const obstacle = selectedValue(responses.Q3);
  const stateScore = Number(responses.Q6?.response ?? NaN);

  const alreadyEvident =
    obstacle === "burnout" || (Number.isFinite(stateScore) && stateScore <= 3);

  if (alreadyEvident) {
    return flow.filter((id) => id !== "Q7");
  }

  return flow;
}

/** Map a question id to its progress-step label index. */
export function getStepLabelIndex(questionId: string): number {
  const index = BASE_FLOW.indexOf(questionId as (typeof BASE_FLOW)[number]);
  return index === -1 ? 0 : index;
}

export const QUESTION_ORDER = buildQuestionFlow();

export function getNextQuestion(
  currentId: string,
  responses: OnboardingResponseMap = {}
): string | null {
  const flow = buildQuestionFlow(responses);
  const idx = flow.indexOf(currentId);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}

export function getPreviousQuestion(
  currentId: string,
  responses: OnboardingResponseMap = {}
): string | null {
  const flow = buildQuestionFlow(responses);
  const idx = flow.indexOf(currentId);
  return idx <= 0 ? null : flow[idx - 1];
}

export function getTotalQuestions(responses: OnboardingResponseMap = {}): number {
  return buildQuestionFlow(responses).length;
}

export function getQuestionNumber(
  questionId: string,
  responses: OnboardingResponseMap = {}
): number {
  const flow = buildQuestionFlow(responses);
  const idx = flow.indexOf(questionId);
  return idx === -1 ? 1 : idx + 1;
}

export function isValidQuestionId(id: string): boolean {
  return id in ONBOARDING_QUESTIONS;
}

/** Map life-area hints to a goal category, when inferring from goal text. */
export const DIRECTION_AREA_MAP: Record<
  string,
  { goalCategory: string; lifeArea: string; label: string }
> = {
  career: { goalCategory: "career_work", lifeArea: "career", label: "Career growth" },
  business: { goalCategory: "career_work", lifeArea: "business", label: "Build a business" },
  fitness: { goalCategory: "health_fitness", lifeArea: "health", label: "Fitness" },
  study: { goalCategory: "learning", lifeArea: "learning", label: "Learning" },
  relationships: { goalCategory: "relationships", lifeArea: "relationships", label: "Relationships" },
  family: { goalCategory: "relationships", lifeArea: "relationships", label: "Family" },
  finance: { goalCategory: "finances", lifeArea: "finance", label: "Financial freedom" },
  health: { goalCategory: "health_fitness", lifeArea: "health", label: "Health" },
  creativity: { goalCategory: "creativity", lifeArea: "personal", label: "Creativity" },
  other: { goalCategory: "personal", lifeArea: "personal", label: "Personal growth" },
};

export const OBSTACLE_PATTERN_MAP: Record<
  string,
  { pattern: string; trigger: string; behavioralImpact: string }
> = {
  overthinking: {
    pattern: "overthinking",
    trigger: "Uncertainty before committing",
    behavioralImpact: "Delays shipping and gathering real feedback",
  },
  procrastination: {
    pattern: "procrastination",
    trigger: "Task feels large or unclear",
    behavioralImpact: "Important work gets postponed",
  },
  burnout: {
    pattern: "burnout",
    trigger: "Sustained load without recovery",
    behavioralImpact: "Energy drops and consistency breaks",
  },
  scattered_focus: {
    pattern: "scattered_focus",
    trigger: "Too many open threads",
    behavioralImpact: "Progress spreads thin across goals",
  },
  scattered_focus_priorities: {
    pattern: "scattered_focus",
    trigger: "Competing priorities",
    behavioralImpact: "Hard to protect one thing at a time",
  },
  lack_of_time: {
    pattern: "scattered_focus",
    trigger: "Calendar overload",
    behavioralImpact: "The important work gets squeezed out",
  },
  inconsistency: {
    pattern: "inconsistency",
    trigger: "Irregular follow-through",
    behavioralImpact: "Momentum resets frequently",
  },
  avoidance: {
    pattern: "avoidance",
    trigger: "Fear of failure or judgment",
    behavioralImpact: "High-value tasks get skipped",
  },
};

/**
 * What each depletion answer means for planning.
 *
 * Stored as the user's `depletedBy` context so the coach can plan around it
 * rather than merely record it.
 */
export const DEPLETION_MAP: Record<string, { label: string; planningRule: string }> = {
  meetings: {
    label: "Back-to-back meetings",
    planningRule: "Keep demanding work off heavy meeting days.",
  },
  context_switching: {
    label: "Switching between things",
    planningRule: "Fewer, larger blocks. Avoid splitting a goal across a day.",
  },
  ambiguity: {
    label: "Unclear expectations",
    planningRule: "Every task needs a concrete deliverable, never 'look into'.",
  },
  conflict: {
    label: "Friction with people",
    planningRule: "Do not stack a hard conversation next to deep work.",
  },
  poor_sleep: {
    label: "Bad sleep",
    planningRule: "Size the day from the morning state reading, not the plan.",
  },
  long_hours: {
    label: "Long stretches without a break",
    planningRule: "Cap consecutive demanding tasks; build in recovery.",
  },
  admin: {
    label: "Admin and busywork",
    planningRule: "Batch admin away from the highest-leverage block.",
  },
};
