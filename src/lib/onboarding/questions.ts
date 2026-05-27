/**
 * Onboarding Questionnaire Configuration
 * Defines all questions, types, options, and flow
 */

export interface OnboardingQuestion {
  id: string;
  type: "text" | "textarea" | "multiple_choice" | "forced_choice" | "slider";
  prompt: string;
  promptVariant?: "concise" | "conversational" | "mentor";
  options?: Array<{ value: string; label: string }>;
  allowMultiple?: boolean;
  allowOther?: boolean;
  otherPrompt?: string;
  min?: number;
  max?: number;
  labels?: { min: string; max: string };
  optional?: boolean;
  nextQuestion?: string | ((response: any) => string);
}

export const ONBOARDING_QUESTIONS: Record<string, OnboardingQuestion> = {
  Q1: {
    id: "Q1",
    type: "textarea",
    prompt: "What's most important to you right now in your life?",
    promptVariant: "concise",
    optional: false,
  },

  Q2: {
    id: "Q2",
    type: "textarea",
    prompt: "Where do you see yourself in a year? What would success look like?",
    promptVariant: "conversational",
    optional: false,
  },

  Q3: {
    id: "Q3",
    type: "multiple_choice",
    prompt: "What obstacles are you facing? (Select all that apply)",
    promptVariant: "concise",
    allowMultiple: true,
    allowOther: true,
    otherPrompt: "Can you tell me more about the challenges you're facing?",
    options: [
      { value: "time_management", label: "Time management" },
      { value: "motivation", label: "Motivation" },
      { value: "stress", label: "Stress" },
      { value: "relationships", label: "Relationships" },
      { value: "health", label: "Health" },
      { value: "career_uncertainty", label: "Career uncertainty" },
      { value: "financial_concerns", label: "Financial concerns" },
    ],
  },

  Q4: {
    id: "Q4",
    type: "multiple_choice",
    prompt: "What do you want to focus on daily?",
    promptVariant: "concise",
    allowMultiple: true,
    allowOther: true,
    otherPrompt: "What specific areas do you want to prioritize?",
    options: [
      { value: "personal_growth", label: "Personal growth" },
      { value: "health_fitness", label: "Health & fitness" },
      { value: "career_work", label: "Career/Work" },
      { value: "relationships", label: "Relationships" },
      { value: "creativity", label: "Creativity" },
      { value: "learning", label: "Learning" },
    ],
  },

  Q5: {
    id: "Q5",
    type: "forced_choice",
    prompt: "How do you prefer guidance?",
    promptVariant: "concise",
    allowOther: false,
    options: [
      { value: "gentle", label: "Gentle encouragement" },
      { value: "direct", label: "Direct accountability" },
      { value: "balanced", label: "Balanced approach" },
      { value: "strategic", label: "Strategic planning" },
    ],
  },

  Q6: {
    id: "Q6",
    type: "forced_choice",
    prompt: "What area of life needs most attention right now?",
    promptVariant: "conversational",
    allowOther: true,
    otherPrompt: "What specific area do you want to focus on?",
    options: [
      { value: "career", label: "Career" },
      { value: "health", label: "Health" },
      { value: "relationships", label: "Relationships" },
      { value: "personal_development", label: "Personal development" },
      { value: "finances", label: "Finances" },
    ],
  },

  Q7: {
    id: "Q7",
    type: "forced_choice",
    prompt: "What motivates you most?",
    promptVariant: "concise",
    allowOther: true,
    otherPrompt: "What drives you forward?",
    options: [
      { value: "achievement", label: "Achievement" },
      { value: "growth", label: "Growth" },
      { value: "connection", label: "Connection" },
      { value: "impact", label: "Impact" },
      { value: "freedom", label: "Freedom" },
      { value: "security", label: "Security" },
    ],
  },

  Q8: {
    id: "Q8",
    type: "forced_choice",
    prompt: "When you feel overwhelmed, you typically...",
    promptVariant: "concise",
    allowOther: true,
    otherPrompt: "Tell me more about how you handle overwhelm.",
    options: [
      { value: "avoid_tasks", label: "Avoid tasks" },
      { value: "overplan", label: "Overplan" },
      { value: "distract_myself", label: "Distract myself" },
      { value: "work_harder", label: "Work harder" },
      { value: "shut_down", label: "Shut down" },
      { value: "start_something_new", label: "Start something new" },
    ],
  },

  Q9: {
    id: "Q9",
    type: "forced_choice",
    prompt: "How often do you want to reflect on your progress?",
    promptVariant: "concise",
    allowOther: false,
    options: [
      { value: "daily", label: "Daily" },
      { value: "few_times_week", label: "A few times a week" },
      { value: "weekly", label: "Weekly" },
      { value: "as_needed", label: "As needed" },
    ],
  },

  Q10: {
    id: "Q10",
    type: "text",
    prompt: "What's one thing you want to accomplish in the next 30 days?",
    promptVariant: "mentor",
    optional: false,
  },
};

export const QUESTION_ORDER = [
  "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10"
];

export function getNextQuestion(currentId: string): string | null {
  const currentIndex = QUESTION_ORDER.indexOf(currentId);
  if (currentIndex === -1 || currentIndex === QUESTION_ORDER.length - 1) {
    return null;
  }
  return QUESTION_ORDER[currentIndex + 1];
}

export function getTotalQuestions(): number {
  return QUESTION_ORDER.length;
}

export function getQuestionNumber(questionId: string): number {
  return QUESTION_ORDER.indexOf(questionId) + 1;
}
