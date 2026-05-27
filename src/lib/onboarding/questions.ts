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
    prompt: "What are you trying to build toward right now?",
    promptVariant: "concise",
    optional: false,
  },

  Q2: {
    id: "Q2",
    type: "textarea",
    prompt: "If the next 3 years went perfectly, what would look different?",
    promptVariant: "conversational",
    optional: true,
  },

  Q3: {
    id: "Q3",
    type: "multiple_choice",
    prompt: "What usually stops your momentum?",
    promptVariant: "concise",
    allowMultiple: true,
    allowOther: true,
    otherPrompt: "You mentioned something else as a blocker. Can you say a bit more about what that looks like?",
    options: [
      { value: "overthinking", label: "Overthinking" },
      { value: "perfectionism", label: "Perfectionism" },
      { value: "burnout", label: "Burnout" },
      { value: "distraction", label: "Distraction" },
      { value: "lack_of_clarity", label: "Lack of Clarity" },
      { value: "fear_of_failure", label: "Fear of Failure" },
    ],
  },

  Q4: {
    id: "Q4",
    type: "forced_choice",
    prompt: "What feels more natural to you?",
    promptVariant: "concise",
    allowOther: true,
    otherPrompt: "Interesting approach. Please describe how that feels natural for you in your workflow.",
    options: [
      { value: "planning", label: "Planning" },
      { value: "building", label: "Building" },
      { value: "exploring", label: "Exploring" },
      { value: "refining", label: "Refining" },
    ],
  },

  Q5: {
    id: "Q5",
    type: "slider",
    prompt: "How often do you delay taking action because you're still thinking?",
    promptVariant: "concise",
    min: 1,
    max: 5,
    labels: { min: "Rarely", max: "Constantly" },
  },

  Q6: {
    id: "Q6",
    type: "textarea",
    prompt: "Why does building something of your own matter to you?",
    promptVariant: "mentor",
  },

  Q7: {
    id: "Q7",
    type: "forced_choice",
    prompt: "What part of this process feels heaviest right now?",
    promptVariant: "concise",
    allowOther: true,
    otherPrompt: "I see that's challenging. What about that part feels heaviest?",
    options: [
      { value: "starting", label: "Starting" },
      { value: "committing", label: "Committing" },
      { value: "finishing", label: "Finishing" },
      { value: "staying_consistent", label: "Staying Consistent" },
      { value: "narrowing_focus", label: "Narrowing Focus" },
    ],
  },

  Q8: {
    id: "Q8",
    type: "forced_choice",
    prompt: "What currently feels most unstable in your life?",
    promptVariant: "conversational",
    allowOther: true,
    otherPrompt: "That sounds challenging. Could you tell me more?",
    options: [
      { value: "sleep", label: "Sleep" },
      { value: "focus", label: "Focus" },
      { value: "consistency", label: "Consistency" },
      { value: "direction", label: "Direction" },
      { value: "energy", label: "Energy" },
      { value: "relationships", label: "Relationships" },
      { value: "confidence", label: "Confidence" },
    ],
  },

  Q9: {
    id: "Q9",
    type: "forced_choice",
    prompt: "When you feel overwhelmed, what do you usually do?",
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

  Q10: {
    id: "Q10",
    type: "text",
    prompt: "What is one thing you want to complete in the next 30 days?",
    promptVariant: "mentor",
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
