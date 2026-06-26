/**
 * MenAI onboarding — minimal execution setup.
 * Output: concrete goal → deadline → blocker → success criteria
 */

export interface OnboardingQuestion {
  id: string;
  type: "text" | "textarea" | "multiple_choice" | "forced_choice" | "slider" | "date";
  prompt: string;
  subtitle?: string;
  options?: Array<{ value: string; label: string }>;
  allowMultiple?: boolean;
  allowOther?: boolean;
  optional?: boolean;
  otherPrompt?: string;
  min?: number;
  max?: number;
  labels?: { min: string; max: string };
}

export const ONBOARDING_QUESTIONS: Record<string, OnboardingQuestion> = {
  Q2: {
    id: "Q2",
    type: "text",
    prompt: "What are you actively trying to achieve in the next 30–90 days?",
    subtitle: "A concrete goal — e.g. Launch MenAI Beta, Get 5 clients, Lose 5 kg. Not a vision like 'excel in life'.",
  },
  Q3: {
    id: "Q3",
    type: "forced_choice",
    prompt: "When do you want to achieve this?",
    options: [
      { value: "30", label: "30 days" },
      { value: "60", label: "60 days" },
      { value: "90", label: "90 days" },
      { value: "custom", label: "Custom date" },
      { value: "flexible", label: "Flexible — no fixed date" },
    ],
  },
  Q4: {
    id: "Q4",
    type: "forced_choice",
    prompt: "What is the biggest thing slowing you down?",
    options: [
      { value: "overthinking", label: "Overthinking" },
      { value: "procrastination", label: "Procrastination" },
      { value: "burnout", label: "Low energy" },
      { value: "scattered_focus", label: "Lack of clarity" },
      { value: "scattered_focus_priorities", label: "Too many priorities" },
      { value: "lack_of_time", label: "Lack of time" },
      { value: "avoidance", label: "Fear of failure" },
      { value: "inconsistency", label: "Consistency" },
    ],
    allowOther: true,
    otherPrompt: "What else tends to get in the way?",
  },
  Q7: {
    id: "Q7",
    type: "text",
    prompt: "What would make the next 30 days successful?",
    subtitle: "Examples: Launch beta · Lose 3 kg · Finish portfolio · Get first client",
  },
};

export type OnboardingResponseMap = Record<
  string,
  { response?: string | null; responseData?: { selected?: string | string[] } }
>;

/** Minimal flow — name comes from profile; goal, deadline, blocker, success criteria */
export function buildQuestionFlow(_responses: OnboardingResponseMap = {}): string[] {
  return ["Q2", "Q3", "Q4", "Q7"];
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

/** Map life-area hints → goal category (used when inferring from goal text) */
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
    trigger: "Sustained high load without recovery",
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
    behavioralImpact: "Hard to protect one initiative at a time",
  },
  lack_of_time: {
    pattern: "scattered_focus",
    trigger: "Calendar overload",
    behavioralImpact: "Important initiative work gets squeezed out",
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
