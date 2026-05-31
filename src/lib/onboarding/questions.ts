/**
 * MenAI onboarding — builds an execution system, not a profile.
 * Output: direction → initiative → deadline → pattern → coaching → check-ins → success criteria
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
  Q1: {
    id: "Q1",
    type: "multiple_choice",
    prompt: "What matters most to you right now?",
    subtitle: "Select all that apply — stored as long-term direction (AI context, not daily clutter).",
    allowMultiple: true,
    options: [
      { value: "business", label: "Business" },
      { value: "career", label: "Career" },
      { value: "finance", label: "Finance" },
      { value: "fitness", label: "Fitness" },
      { value: "health", label: "Health" },
      { value: "study", label: "Learning" },
      { value: "relationships", label: "Relationships" },
      { value: "family", label: "Family" },
      { value: "creativity", label: "Creativity" },
      { value: "other", label: "Other" },
    ],
  },
  Q1B: {
    id: "Q1B",
    type: "text",
    prompt: "What are you building?",
    subtitle: "Examples: AI SaaS · Agency · Marketplace · Content business",
  },
  Q2: {
    id: "Q2",
    type: "text",
    prompt: "What are you actively trying to achieve in the next 30–90 days?",
    subtitle: "Short initiative name — e.g. Launch MenAI Beta, Lose 5 kg, Pass UPSC prelims",
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
  Q5: {
    id: "Q5",
    type: "forced_choice",
    prompt: "How should guidance feel?",
    options: [
      { value: "supportive", label: "Supportive" },
      { value: "balanced", label: "Balanced" },
      { value: "direct", label: "Direct" },
    ],
  },
  Q6: {
    id: "Q6",
    type: "forced_choice",
    prompt: "When should check-ins happen?",
    options: [
      { value: "morning", label: "Morning" },
      { value: "morning_night", label: "Morning + night" },
      { value: "full_day", label: "Morning + afternoon + night" },
      { value: "on_open", label: "Only when I open the app" },
    ],
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

/** Dynamic flow — Q1B only when Business selected */
export function buildQuestionFlow(responses: OnboardingResponseMap = {}): string[] {
  const q1 = responses.Q1?.responseData?.selected;
  const areas = Array.isArray(q1) ? q1 : q1 ? [q1] : [];
  const flow: string[] = ["Q1"];
  if (areas.includes("business")) flow.push("Q1B");
  flow.push("Q2", "Q3", "Q4", "Q5", "Q6", "Q7");
  return flow;
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

/** Map onboarding direction pick → goal category + initiative life area */
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

export const COACHING_STYLE_MAP: Record<string, string> = {
  supportive: "gentle",
  balanced: "balanced",
  direct: "direct",
};
