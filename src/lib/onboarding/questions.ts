/**
 * MenAI onboarding — structured intelligence seed (not personality quiz).
 * Creates: direction → initiative → patterns → planning preferences.
 */

export interface OnboardingQuestion {
  id: string;
  type: "text" | "textarea" | "multiple_choice" | "forced_choice" | "slider";
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
    subtitle: "Select all that apply — these become your long-term direction.",
    allowMultiple: true,
    options: [
      { value: "career", label: "Career" },
      { value: "business", label: "Business" },
      { value: "fitness", label: "Fitness" },
      { value: "study", label: "Study / exams" },
      { value: "relationships", label: "Relationships" },
      { value: "finance", label: "Finance" },
      { value: "health", label: "Health" },
      { value: "other", label: "Other" },
    ],
  },
  Q2: {
    id: "Q2",
    type: "textarea",
    prompt: "What long-term outcomes are you building toward?",
    subtitle: "One per line. Example: Financial freedom · Build scalable businesses · Create recurring income",
    optional: true,
  },
  Q3: {
    id: "Q3",
    type: "text",
    prompt: "What are you actively trying to achieve in the next 30–90 days?",
    subtitle: "This becomes your first initiative. Example: Launch AI SaaS MVP · Lose 5 kg · Crack UPSC Prelims",
  },
  Q4: {
    id: "Q4",
    type: "forced_choice",
    prompt: "When do you want to achieve this?",
    options: [
      { value: "30", label: "30 days" },
      { value: "60", label: "60 days" },
      { value: "90", label: "90 days" },
    ],
  },
  Q5: {
    id: "Q5",
    type: "forced_choice",
    prompt: "What usually stops you?",
    subtitle: "Helps MenAI plan around your patterns from day one.",
    options: [
      { value: "overthinking", label: "Overthinking" },
      { value: "procrastination", label: "Procrastination" },
      { value: "burnout", label: "Low energy" },
      { value: "scattered_focus", label: "Lack of clarity" },
      { value: "scattered_focus_priorities", label: "Too many priorities" },
      { value: "inconsistency", label: "Inconsistency" },
      { value: "avoidance", label: "Avoidance" },
    ],
  },
  Q6: {
    id: "Q6",
    type: "forced_choice",
    prompt: "How do you prefer daily tasks?",
    options: [
      { value: "small_actions", label: "Very small actions" },
      { value: "balanced", label: "Balanced" },
      { value: "aggressive", label: "Aggressive / high output" },
    ],
  },
  Q7: {
    id: "Q7",
    type: "forced_choice",
    prompt: "How often should MenAI check in?",
    options: [
      { value: "morning_night", label: "Morning + night" },
      { value: "full_day", label: "Morning + afternoon + night" },
      { value: "on_open", label: "Only when I open the app" },
    ],
  },
};

export const QUESTION_ORDER = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"];

export function getNextQuestion(currentId: string): string | null {
  const idx = QUESTION_ORDER.indexOf(currentId);
  if (idx === -1 || idx === QUESTION_ORDER.length - 1) return null;
  return QUESTION_ORDER[idx + 1];
}

export function getTotalQuestions(): number {
  return QUESTION_ORDER.length;
}

export function getQuestionNumber(questionId: string): number {
  return QUESTION_ORDER.indexOf(questionId) + 1;
}

/** Map onboarding direction pick → goal category + initiative life area */
export const DIRECTION_AREA_MAP: Record<
  string,
  { goalCategory: string; lifeArea: string; label: string }
> = {
  career: { goalCategory: "career_work", lifeArea: "career", label: "Career growth" },
  business: { goalCategory: "career_work", lifeArea: "business", label: "Build a business" },
  fitness: { goalCategory: "health_fitness", lifeArea: "health", label: "Fitness" },
  study: { goalCategory: "learning", lifeArea: "learning", label: "Study & exams" },
  relationships: { goalCategory: "relationships", lifeArea: "relationships", label: "Relationships" },
  finance: { goalCategory: "finances", lifeArea: "finance", label: "Financial freedom" },
  health: { goalCategory: "health_fitness", lifeArea: "health", label: "Health" },
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
