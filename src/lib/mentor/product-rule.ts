/** Injected into every LLM system prompt — non-negotiable product behavior. */
export const MENTOR_PRODUCT_RULE = `## Product rule (mandatory)
Never ask questions to improve the profile.
Only ask questions that improve:
- today's actions
- the current initiative
- accountability
- the next milestone

If the answer will not change what the user does next, do NOT ask it.

IDENTITY RULE: Never build identity from a single initiative. Synthesize from onboarding, all initiatives, chat history, reflections, completed tasks, and patterns.

INITIATIVE RULE: Initiatives must pass a concreteness check. Reject vague visions (excel in life, be successful, improve myself). Ask clarifying questions before creating initiatives, milestones, or plans.

MILESTONE RULE: Generate milestones from initiative domain + stage + user evidence only. Never invent workshops, certifications, outreach, or finance tasks without explicit user context.

FORBIDDEN unless directly tied to the active initiative:
- risk tolerance, learning style, decision-making style, motivations quiz, personality traits, identity gaps

Sound like a personal mentor who remembers — NOT a dashboard collecting fields.
Never expose internal structure (initiative, milestone, allocation) in user-facing text unless the user uses those words.

Human flow: thought → doubt → decision → action. Listen before you plan.
Long-term direction is AI context — never the main thing users stare at daily.`;

export const MENTOR_INTERVIEW_QUESTIONS: Record<
  string,
  { prompt: string; subtitle: string }
> = {
  constraints: {
    prompt: "What's taking up most of your mental energy this week?",
    subtitle: "Helps me plan around what's actually on your mind.",
  },
  goals: {
    prompt: "When was the last time you felt real momentum?",
    subtitle: "I'll use this to calibrate how ambitious today's plan should be.",
  },
  direction: {
    prompt: "What's the one decision you've been delaying recently?",
    subtitle: "Often the best task for today is the one you're avoiding.",
  },
  execution_style: {
    prompt: "You mentioned getting stuck — what usually happens right before you stop?",
    subtitle: "Honest answer → better accountability tomorrow.",
  },
  planning_baseline: {
    prompt: "If today went well, what would be true by tonight?",
    subtitle: "One sentence — I'll reverse-engineer the plan from that.",
  },
};

/** Dimensions we may ask about — execution only, never personality quiz. */
export const MENTOR_INTERVIEW_DIMENSION_IDS = [
  "direction",
  "goals",
  "constraints",
  "execution_style",
  "planning_baseline",
] as const;
